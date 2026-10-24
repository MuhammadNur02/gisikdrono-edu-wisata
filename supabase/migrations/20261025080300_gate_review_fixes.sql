-- Independent review of PR #53 (docs/PRD.md FR-SCAN-07, FR-POST-02; docs/Security.md §9.2; CLAUDE.md §7.4; GUEST-04,
-- QR-08). Forward-only: 20261025080000 and 20261025080100 already ran on staging, so they stay as applied.
--
--   M1  find_manual_ticket was a stable staff RPC that any officer at AAL2 could call straight through PostgREST,
--       past the route's rate limit and Origin check, and it logged nothing: 0000 to 9999 against today's booking
--       codes would read each PIC's last four digits without the audit and cap of rpc_reveal_booking_contact. It is
--       now volatile, every lookup is a manual_lookup security event, and it keeps its own fail-closed caps in
--       rate_limit_buckets: 30 lookups an hour per officer and 5 wrong last-four a day per booking. Past either cap it
--       answers rate_limited without looking, and the first refusal of a window is a high rate_limited event. It
--       answers jsonb {ticket_id, rate_limited}, so the route (Task P4.4.02) can tell "not found" from "wait".
--   M2  issue_certificates brought back every certificate revoked under the reason text 'undo_check_in', the
--       participants' too, whatever count the gate recorded after the undo: 30 certificates, an undo, a re-check-in
--       of 13, and all 30 came back. The flag certificates.revoked_by_undo, which only undo_check_in sets, now names
--       what may come back, and a participant's comes back only while the list still fits the fewest people a gate
--       let in. A superadmin's revocation, whatever its reason text, stays revoked.
--   L1  validate_ticket raised 23505 when two requests of one attempt raced; the slower one now gets the stored answer.
--   L4  a QR scan names its payload: p_source 'qr' needs p_raw, in the preview and the commit alike.


-- ===== M1: every manual lookup is a security event =====

-- The type list of 20261020080000_auth_review_events with manual_lookup.
alter table public.security_events drop constraint security_events_event_type_check;
alter table public.security_events add constraint security_events_event_type_check check (event_type in (
  'webhook_signature_invalid','webhook_amount_mismatch','status_disagreement','login_failed','login_locked',
  'mfa_failed','mfa_enrolled','scanner_invalid_signature','scanner_lockout','rate_limited','turnstile_failed',
  'upload_rejected','role_changed','staff_disabled','key_rotated','export_downloaded','pii_revealed',
  'manual_checkin','manual_backfill','undo_check_in','cron_failed','notification_dead','price_changed',
  'session_changed_with_bookings','quota_pressure','mfa_reset','notification_blocked','upload_sanitized',
  'mfa_locked','session_revoke_failed','manual_lookup'));


-- ===== M1: helpers =====

-- The hits p_key has in the current window of internal.rate_limit_hit, without counting one.
create function internal.rate_limit_count(p_key text, p_window_seconds integer) returns integer
  language sql stable
  set search_path = ''
as $$
  select coalesce((select b.count from public.rate_limit_buckets b
                   where b.key = p_key
                     and b.window_start = to_timestamp(floor(extract(epoch from now()) / p_window_seconds)
                                                       * p_window_seconds)), 0);
$$;

-- The first refusal past a cap in its window is a high rate_limited event; the later ones are counted in the bucket
-- and logged as manual_lookup, so a flood never floods the alerts.
create function internal.note_manual_lookup_cap(
  p_key text, p_limit integer, p_window_seconds integer, p_limit_name text, p_booking_id uuid
) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  if internal.rate_limit_count(p_key, p_window_seconds) = p_limit + 1 then
    insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
    values ('rate_limited', 'high', auth.uid(), public.app_rw_id(), case when p_booking_id is not null then 'bookings' end,
            p_booking_id::text, jsonb_build_object('limit', p_limit_name, 'cap', p_limit, 'window_seconds',
                                                   p_window_seconds));
  end if;
end;
$$;

-- Logs one lookup and gives the officer its answer. The event names the booking when the code named one, never the
-- digits tried; outcome is found, not_found, wrong_digits, invalid_input or rate_limited.
create function internal.answer_manual_lookup(p_booking_id uuid, p_ticket_id uuid, p_outcome text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
begin
  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('manual_lookup', case when p_outcome = 'found' then 'info' else 'medium' end::public.alert_severity,
          auth.uid(), public.app_rw_id(), case when p_booking_id is not null then 'bookings' end, p_booking_id::text,
          jsonb_build_object('outcome', p_outcome));
  return jsonb_build_object('ticket_id', p_ticket_id, 'rate_limited', p_outcome = 'rate_limited');
end;
$$;

revoke execute on function internal.rate_limit_count(text, integer),
  internal.note_manual_lookup_cap(text, integer, integer, text, uuid),
  internal.answer_manual_lookup(uuid, uuid, text)
  from public, anon, authenticated, service_role;


-- ===== M1: find_manual_ticket =====

-- The return type changes, so the 20261025080100 version goes. Nothing calls it yet: the route is Task P4.4.02.
drop function public.find_manual_ticket(text, text);

-- FR-SCAN-07: the QR nobody can read. Today's ticket of the officer's RW for the booking, when the last four digits
-- match its verified phone; ticket_id null for anything else, so a wrong code and a wrong phone read the same. Volatile:
-- it counts and logs every call. The officer's cap is counted before anything is read; a booking that has had five
-- wrong last-four today answers rate_limited even to the right ones, so guessing stops at five. The booking's turns
-- are taken one at a time so parallel guesses cannot all pass the count.
create function public.find_manual_ticket(p_booking_code text, p_phone_last_digits text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  officer_cap constant integer := 30;
  officer_window constant integer := 3600;
  wrong_digits_cap constant integer := 5;
  wrong_digits_window constant integer := 86400;
  officer_key text := 'manual_lookup:officer:' || auth.uid()::text;
  booking_key text;
  found_booking uuid;
  digits_match boolean;
  found_ticket uuid;
begin
  perform internal.require_gate_officer();
  if not internal.rate_limit_hit(officer_key, officer_cap, officer_window) then
    perform internal.note_manual_lookup_cap(officer_key, officer_cap, officer_window, 'manual_lookup_officer', null);
    return internal.answer_manual_lookup(null, null, 'rate_limited');
  end if;
  if coalesce(p_phone_last_digits, '') !~ '^[0-9]{4}$' then
    return internal.answer_manual_lookup(null, null, 'invalid_input');
  end if;

  select b.id, b.phone_verified_at is not null and right(b.pic_phone, 4) = p_phone_last_digits
  into found_booking, digits_match
  from public.bookings b where b.booking_code = upper(btrim(p_booking_code));
  if found_booking is null then
    return internal.answer_manual_lookup(null, null, 'not_found');
  end if;

  booking_key := 'manual_lookup:booking:' || found_booking::text;
  perform pg_advisory_xact_lock(hashtext(booking_key));
  if internal.rate_limit_count(booking_key, wrong_digits_window) >= wrong_digits_cap then
    perform internal.rate_limit_hit(booking_key, wrong_digits_cap, wrong_digits_window);
    perform internal.note_manual_lookup_cap(booking_key, wrong_digits_cap, wrong_digits_window,
                                            'manual_lookup_booking', found_booking);
    return internal.answer_manual_lookup(found_booking, null, 'rate_limited');
  end if;
  if not coalesce(digits_match, false) then
    perform internal.rate_limit_hit(booking_key, wrong_digits_cap, wrong_digits_window);
    return internal.answer_manual_lookup(found_booking, null, 'wrong_digits');
  end if;

  select t.id into found_ticket
  from public.tickets_qr t
  where t.booking_id = found_booking and t.valid_on = public.today_jkt()
    and (public.is_superadmin() or public.owns_rw(t.rw_id))
  order by now() between t.valid_from and t.valid_until desc, t.valid_from
  limit 1;
  return internal.answer_manual_lookup(found_booking, found_ticket,
                                       case when found_ticket is null then 'not_found' else 'found' end);
end;
$$;

revoke execute on function public.find_manual_ticket(text, text) from public, anon, service_role;
grant execute on function public.find_manual_ticket(text, text) to authenticated;


-- ===== M2: the flag of an undone check-in =====

alter table public.certificates add column revoked_by_undo boolean not null default false;
alter table public.certificates add constraint certificates_undo_is_revoked
  check (not revoked_by_undo or status = 'revoked');

-- What undo_check_in revoked before this migration: revoked in the same transaction as an undo_check_in security event
-- on one of the booking's tickets, which is the event's own timestamp. A superadmin's revocation that happens to read
-- 'undo_check_in' has no such event and is left alone.
update public.certificates c
set revoked_by_undo = true
where c.status = 'revoked' and c.revoke_reason = 'undo_check_in'
  and exists (select 1 from public.security_events e
              join public.tickets_qr t on e.entity_id = t.id::text
              where e.event_type = 'undo_check_in' and e.entity_type = 'tickets_qr' and t.booking_id = c.booking_id
                and e.occurred_at = c.revoked_at);

-- The flag is a status of its own: only the transition functions write it, and a new certificate starts without it.
drop trigger guard_status_writes on public.certificates;
create trigger guard_status_writes before update on public.certificates
  for each row execute function internal.guard_status_writes('status', 'revoked_by_undo');
drop trigger guard_status_inserts on public.certificates;
create trigger guard_status_inserts before insert on public.certificates
  for each row execute function internal.guard_status_inserts('status=issued', 'revoked_by_undo=false');

-- Replaces the 20261023090100 version: revoked_by_undo joins the audited columns of certificates.
create or replace function internal.audit_columns(p_table text) returns text[]
  language sql immutable
  set search_path = ''
as $$
  select case p_table
    when 'bookings' then array['id', 'booking_code', 'status', 'channel', 'package_id', 'rw_ids', 'booker_type',
      'institution_name', 'pax_count', 'visit_date', 'visit_date_end', 'subtotal_package', 'subtotal_addons',
      'discount_amount', 'total_amount', 'amount_paid', 'currency', 'expires_at', 'quoted_at', 'paid_at',
      'checked_in_at', 'completed_at', 'cancelled_at', 'cancelled_by', 'expired_at', 'refunded_at', 'needs_review',
      'phone_verified_at', 'email_verified_at', 'consent_version', 'consented_at', 'guardian_consented_at',
      'token_version', 'created_by', 'created_at', 'pii_purged_at']
    when 'booking_legs' then array['id', 'booking_id', 'rw_id', 'visit_session_id', 'leg_order', 'pax_count', 'status',
      'quota_reserved_at', 'quota_released_at', 'checked_in_at']
    when 'booking_participants' then array['id', 'booking_id', 'seq_no', 'group_label', 'role_label', 'created_at']
    when 'payments' then array['id', 'booking_id', 'attempt_no', 'provider', 'method', 'status', 'order_id',
      'provider_txn_id', 'gross_amount', 'payment_type_raw', 'va_bank', 'transaction_time', 'settlement_time',
      'expiry_time', 'fraud_status', 'status_code', 'manual_reference', 'recorded_by', 'refunded_amount', 'created_at']
    when 'payment_adjustments' then array['id', 'booking_id', 'payment_id', 'type', 'status', 'amount', 'reason',
      'evidence_path', 'proposed_by', 'proposed_at', 'approved_by', 'approved_at', 'rejected_reason',
      'apply_not_before', 'applied_at']
    when 'tickets_qr' then array['id', 'booking_id', 'booking_leg_id', 'rw_id', 'visit_session_id', 'ticket_code',
      'status', 'valid_on', 'valid_from', 'valid_until', 'pax_count', 'key_id', 'issued_at', 'checked_in_at',
      'checked_in_pax', 'unpaid_pax', 'checked_in_by', 'suspended_at', 'suspend_reason', 'revoked_at', 'revoked_by',
      'revoke_reason']
    when 'certificates' then array['id', 'booking_id', 'participant_id', 'kind', 'certificate_number', 'status',
      'institution_name', 'visit_date', 'rw_ids', 'template_version', 'rendered_at', 'released_at',
      'release_waived_by', 'issued_at', 'issued_by', 'revoked_at', 'revoke_reason', 'revoked_by_undo', 'purged_at']
    when 'quotations' then array['id', 'booking_id', 'quotation_number', 'version', 'status', 'issued_at',
      'valid_until', 'issued_by']
    when 'invoices' then array['id', 'booking_id', 'invoice_number', 'status', 'issued_at', 'due_date', 'amount_due',
      'amount_paid', 'paid_at', 'payment_id', 'receipt_number', 'credit_note_number', 'void_reason', 'voided_at',
      'created_at']
    when 'tour_packages' then array['id', 'rw_id', 'category', 'slug', 'name', 'pricing_basis', 'price_per_pax',
      'flat_price', 'min_pax', 'max_pax', 'is_featured', 'status', 'sort_order', 'valid_from', 'valid_to',
      'created_by', 'updated_by', 'created_at']
    when 'products_umkm' then array['id', 'rw_id', 'vendor_id', 'slug', 'name', 'category', 'price', 'unit_label',
      'min_order_qty', 'max_order_qty', 'lead_time_days', 'is_addon_eligible', 'is_available', 'is_featured',
      'status', 'sort_order', 'created_by', 'created_at']
    when 'umkm_vendors' then array['id', 'rw_id', 'slug', 'name', 'logo_path', 'is_active', 'created_by', 'created_at']
    when 'visit_sessions' then array['id', 'rw_id', 'session_date', 'start_time', 'end_time', 'label', 'capacity',
      'reserved_pax', 'checked_in_pax', 'status', 'template_id', 'created_by', 'created_at']
    when 'session_templates' then array['id', 'rw_id', 'weekday', 'label', 'start_time', 'end_time', 'capacity',
      'is_active', 'created_at']
    when 'profiles' then array['id', 'role', 'rw_id', 'is_active', 'mfa_required', 'claims_version', 'last_login_at',
      'mfa_reset_requested_at', 'mfa_reset_requested_by', 'promotion_requested_at',
      'promotion_requested_by', 'created_by', 'created_at']
    when 'staff_invites' then array['id', 'role', 'rw_id', 'expires_at', 'accepted_at', 'accepted_user_id',
      'revoked_at', 'created_by', 'created_at']
    when 'rw_units' then array['id', 'code', 'slug', 'name', 'short_name', 'theme_label', 'tagline', 'hero_image_path',
      'treasury_bank_name', 'map_lat', 'map_lng', 'accent_key', 'icon_key', 'schedule_enabled', 'products_heading',
      'is_active', 'sort_order', 'created_at']
    when 'revenue_share_rules' then array['id', 'scope', 'rw_id', 'package_id', 'product_id', 'name',
      'effective_from', 'effective_to', 'is_active', 'created_by', 'created_at']
    when 'revenue_share_rule_lines' then array['id', 'rule_id', 'beneficiary', 'rw_id', 'vendor_id', 'pct']
    when 'revenue_share_entries' then array['id', 'booking_id', 'payment_id', 'adjustment_id', 'entry_type',
      'line_ref', 'booking_addon_id', 'rule_id', 'beneficiary', 'beneficiary_key', 'rw_id', 'vendor_id',
      'base_amount', 'pct', 'amount', 'payout_batch_id', 'entry_hash', 'created_at']
    when 'payout_batches' then array['id', 'beneficiary_key', 'period_from', 'period_to', 'total_amount', 'paid_at',
      'reference', 'proof_path', 'created_by', 'created_at']
    when 'site_settings' then array['key', 'value', 'is_public', 'updated_by']
    when 'reviews' then array['id', 'booking_id', 'rw_ids', 'rating', 'institution_name', 'is_anonymous', 'status',
      'is_featured', 'moderated_by', 'moderated_at', 'moderation_note', 'created_at']
    when 'articles' then array['id', 'rw_id', 'slug', 'title', 'category', 'status', 'author_id', 'reviewed_by',
      'published_at', 'created_at']
    when 'hero_banners' then array['id', 'title', 'cta_label', 'cta_href', 'image_path', 'product_id', 'sort_order',
      'is_active', 'starts_at', 'ends_at', 'created_by', 'created_at']
    else array[]::text[]
  end;
$$;

-- FR-POST-02: a booking's participant list fits while it is no longer than the fewest people a gate let in.
create function internal.participant_list_fits(p_booking_id uuid, p_fewest_checked_in integer) returns boolean
  language sql stable
  set search_path = ''
as $$
  select (select count(*) from public.booking_participants p where p.booking_id = p_booking_id)
         <= coalesce(p_fewest_checked_in, 0);
$$;
revoke execute on function internal.participant_list_fits(uuid, integer) from public, anon, authenticated, service_role;

-- Replaces the 20261025080000 version: the fit is participant_list_fits, shared with the restore below.
create or replace function internal.insert_participant_certificates(
  p_booking record, p_fewest_checked_in integer, p_release_at timestamptz, p_issued_by uuid
) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  participant record;
  written integer := 0;
begin
  if not internal.participant_list_fits(p_booking.id, p_fewest_checked_in) then
    return 0;
  end if;
  for participant in
    select p.id, p.full_name from public.booking_participants p
    where p.booking_id = p_booking.id
      and not exists (select 1 from public.certificates c where c.participant_id = p.id and c.kind = 'participant')
    order by p.seq_no
  loop
    perform internal.insert_certificate(p_booking, 'participant', participant.id, participant.full_name, p_release_at,
                                        p_issued_by);
    written := written + 1;
  end loop;
  return written;
end;
$$;

-- Replaces the 20261025080000 version: what comes back is what undo_check_in flagged, the participants' only while
-- the list fits the gates' count now. Those left out keep the flag, so a later undo and a fuller count bring them back.
create or replace function internal.issue_certificates(p_booking_id uuid, p_issued_by uuid) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  booking record;
  attendance record;
  release_at timestamptz;
  written integer;
  added integer;
begin
  select b.id, b.status, b.institution_name, b.pic_name, b.visit_date, b.rw_ids into booking
  from public.bookings b where b.id = p_booking_id;
  select * into attendance from internal.booking_attendance(p_booking_id);
  if booking.status not in ('checked_in', 'completed') or attendance.leg_count = 0
     or attendance.used_count < attendance.leg_count then
    return 0;
  end if;
  release_at := case when attendance.unpaid_pax = 0 then now() end;

  update public.certificates c
  set status = 'issued', revoked_at = null, revoke_reason = null, revoked_by_undo = false,
      released_at = case when c.release_waived_by is not null then c.released_at else release_at end
  where c.booking_id = p_booking_id and c.status = 'revoked' and c.revoked_by_undo
    and (c.kind = 'group' or internal.participant_list_fits(p_booking_id, attendance.fewest_checked_in));
  get diagnostics written = row_count;

  if not exists (select 1 from public.certificates c where c.booking_id = p_booking_id and c.kind = 'group') then
    -- An individual visitor's booking has no institution; its group certificate carries the PIC's name.
    perform internal.insert_certificate(booking, 'group', null, coalesce(booking.institution_name, booking.pic_name),
                                        release_at, p_issued_by);
    written := written + 1;
  end if;
  added := internal.insert_participant_certificates(booking, attendance.fewest_checked_in, release_at, p_issued_by);
  perform internal.announce_released_certificates(p_booking_id);
  return written + added;
end;
$$;

-- Replaces the 20261025080100 version: the certificates it revokes carry revoked_by_undo; the reason text stays for
-- whoever reads the row.
create or replace function internal.reopen_ticket(p_ticket record, p_reason text) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  update public.tickets_qr
  set status = 'issued', checked_in_at = null, checked_in_pax = null, unpaid_pax = 0, checked_in_by = null,
      check_in_note = null
  where id = p_ticket.id;
  update public.booking_legs set status = 'reserved', checked_in_at = null where id = p_ticket.booking_leg_id;
  update public.visit_sessions set checked_in_pax = checked_in_pax - p_ticket.checked_in_pax
  where id = p_ticket.visit_session_id;
  if not exists (select 1 from public.tickets_qr t where t.booking_id = p_ticket.booking_id and t.status = 'used') then
    update public.bookings set status = 'paid', checked_in_at = null where id = p_ticket.booking_id;
    insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason)
    values (p_ticket.booking_id, 'checked_in', 'paid', 'admin', auth.uid(), 'undo_check_in');
  end if;
  update public.certificates
  set status = 'revoked', revoked_at = now(), revoke_reason = internal.undo_check_in_reason(), revoked_by_undo = true
  where booking_id = p_ticket.booking_id and status = 'issued';
  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('undo_check_in', 'medium', auth.uid(), p_ticket.rw_id, 'tickets_qr', p_ticket.id::text,
          jsonb_build_object('reason', p_reason, 'checked_in_pax', p_ticket.checked_in_pax));
end;
$$;

revoke execute on function internal.insert_participant_certificates(record, integer, timestamptz, uuid),
  internal.issue_certificates(uuid, uuid), internal.reopen_ticket(record, text)
  from public, anon, authenticated, service_role;


-- ===== L1 and L4: the scan's attempt and payload =====

-- A QR scan names its payload, whose hash ticket_scans keeps; a manual lookup has none to name.
create function internal.require_scan_payload(p_source text, p_raw text) returns void
  language plpgsql immutable
  set search_path = ''
as $$
begin
  if p_source = 'qr' and nullif(btrim(p_raw), '') is null then
    raise exception 'a QR scan names its payload' using errcode = '22023';
  end if;
end;
$$;

-- Replaces the 20261025080100 version: an attempt already recorded in this phase is left as it is, and the caller reads
-- the stored row back. check_in_ticket records under the audit turn after reading the stored row, so it never meets
-- one; validate_ticket takes no turn and may.
create or replace function internal.record_scan(
  p_attempt_id uuid, p_ticket_id uuid, p_phase public.scan_phase, p_result public.scan_result, p_source text,
  p_attendee_count integer, p_override_reason text, p_raw text, p_device_info jsonb, p_ip inet
) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  insert into public.ticket_scans (attempt_id, ticket_id, rw_id, scanned_by, phase, result, source, attendee_count,
    override_reason, raw_payload, device_info, ip)
  values (p_attempt_id, (select t.id from public.tickets_qr t where t.id = p_ticket_id), public.app_rw_id(),
          auth.uid(), p_phase, p_result, p_source, p_attendee_count, p_override_reason,
          case when p_raw is not null then encode(sha256(convert_to(p_raw, 'UTF8')), 'hex') end, p_device_info, p_ip)
  on conflict (attempt_id, phase) do nothing;
end;
$$;

revoke execute on function internal.require_scan_payload(text, text),
  internal.record_scan(uuid, uuid, public.scan_phase, public.scan_result, text, integer, text, text, jsonb, inet)
  from public, anon, authenticated, service_role;

-- Replaces the 20261025080100 version (FR-SCAN-03): a QR preview needs its payload, and an attempt that raced another
-- request of the same attempt answers what was stored, or 23505 when that request was another officer's or ticket's.
create or replace function public.validate_ticket(
  p_ticket_id uuid, p_attempt_id uuid, p_raw text default null, p_device jsonb default '{}', p_source text default 'qr'
) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  result public.scan_result;
begin
  perform internal.require_gate_officer();
  perform internal.require_scan_source(p_source);
  perform internal.require_scan_payload(p_source, p_raw);
  result := internal.stored_scan_result(p_attempt_id, 'validate', p_ticket_id);
  if result is null then
    perform internal.record_scan(p_attempt_id, p_ticket_id, 'validate',
                                 internal.ticket_verdict(p_ticket_id, p_source, false), p_source, null, null, p_raw,
                                 internal.scan_device(p_device), internal.scan_ip(p_device));
    result := internal.stored_scan_result(p_attempt_id, 'validate', p_ticket_id);
  end if;
  return internal.scan_answer(p_ticket_id, result);
end;
$$;

-- Replaces the 20261025080100 version (FR-SCAN-04): a QR commit needs its payload too; the rest is unchanged.
create or replace function public.check_in_ticket(
  p_ticket_id uuid, p_attempt_id uuid, p_attendee_count integer, p_note text default null, p_device jsonb default '{}',
  p_override boolean default false, p_override_reason text default null, p_source text default 'qr',
  p_raw text default null
) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  overriding boolean := coalesce(p_override, false) and public.is_superadmin();
  reason text := case when overriding then nullif(btrim(p_override_reason), '') end;
  result public.scan_result;
  ticket_booking uuid;
begin
  perform internal.require_gate_officer();
  perform internal.require_scan_source(p_source);
  perform internal.require_scan_payload(p_source, p_raw);
  if overriding and coalesce(length(reason), 0) not between 3 and 300 then
    raise exception 'an override needs a reason of 3 to 300 characters' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  result := internal.stored_scan_result(p_attempt_id, 'check_in', p_ticket_id);
  if result is not null then
    return internal.scan_answer(p_ticket_id, result);
  end if;

  select t.booking_id into ticket_booking from public.tickets_qr t where t.id = p_ticket_id;
  perform 1 from public.bookings b where b.id = ticket_booking for update;
  perform 1 from public.tickets_qr t where t.id = p_ticket_id for update;
  result := internal.ticket_verdict(p_ticket_id, p_source, overriding);
  if result = 'ok' then
    perform internal.note_admission(p_ticket_id, p_source, internal.ticket_verdict(p_ticket_id, p_source, false), reason);
    perform internal.admit_group(p_ticket_id, p_attendee_count, p_note);
  end if;
  perform internal.record_scan(p_attempt_id, p_ticket_id, 'check_in', result, p_source,
                               case when result = 'ok' then p_attendee_count end, reason, p_raw,
                               internal.scan_device(p_device), internal.scan_ip(p_device));
  return internal.scan_answer(p_ticket_id, result);
end;
$$;
