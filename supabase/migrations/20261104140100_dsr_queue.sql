-- Task P4.10.03 (docs/PRD.md FR-PUB-19, §13.1 decision of 2026-10-26; docs/Security.md §7.6; PDP-03, GUEST-10): the
-- superadmin's queue of data-subject requests on /dashboard/bookings/[id] ("Permintaan data").
--
--   Intake  The superadmin opens a request for a booking with its kind and reason (dsr_open). The row starts as
--           received with verified_at NULL, and the booking's own verified WhatsApp number gets a manage link to
--           /reservasi/<code>/privasi. There the guest asks for a dsr_identity code (internal.issue_phone_otp, the same
--           caps and pepper as a booking's code) and types it (internal.verify_phone_otp). Only then does the request
--           count: verified_at is set and the clocks start, 3 x 24 h to acknowledge (due_at) and 14 days to fulfil
--           (fulfil_due_at). The superadmin's word alone never proves who asks, and no number they type is ever used.
--           A request from /privasi/permintaan (Task P3.12.03) is verified before it is created, so it starts there.
--   Queue   dsr_acknowledge, then one way to finish: dsr_record_export (the booking's data, as JSON and PDF in the
--           documents bucket, delivered only as a guest link), dsr_delete_participants, dsr_anonymise_booking (paid
--           bookings too; the invoice, receipt, credit-note and quotation snapshots and their files stay under the
--           10-year financial retention), or dsr_close (rectified, rejected_identity, rejected_other). Each finish
--           sets status and outcome together and tells the guest, through a view link to the same page.
--   Rules   Superadmin only, at AAL2; the destructive steps need a fresh TOTP code (has_fresh_totp). Every step is an
--           audit row and a dsr_handled security event. The table is written only by these functions.
-- verified_at is the column PRD §8 already gives the confirmed identity; it is what "identity_verified_at" names.


-- ===== The table =====

alter table public.dsr_requests
  add column booking_id uuid references public.bookings(id),
  add column acknowledged_at timestamptz,
  add column fulfil_due_at timestamptz,
  add column outcome text,
  add column export_json_path text,
  add column export_pdf_path text,
  add constraint dsr_requests_outcome_ok check (outcome is null or outcome in
    ('exported', 'participants_deleted', 'anonymised', 'rectified', 'rejected_identity', 'rejected_other')),
  add constraint dsr_requests_outcome_status check (
    (status in ('received', 'in_progress')) = (outcome is null)
    and (status <> 'rejected' or outcome in ('rejected_identity', 'rejected_other'))
    and (status <> 'completed' or outcome in ('exported', 'participants_deleted', 'anonymised', 'rectified'))),
  add constraint dsr_requests_export_pair check ((export_json_path is null) = (export_pdf_path is null)),
  add constraint dsr_requests_verified_clocks check (verified_at is null or fulfil_due_at is not null);
create index dsr_requests_booking_idx on public.dsr_requests (booking_id, created_at desc);

-- The queue is written by the functions below only; the superadmin reads it, never the export's paths: the file goes
-- to the guest, not through the superadmin's hands.
drop policy dsr_requests_super_handle on public.dsr_requests;
revoke update (status, handled_by, handled_at, resolution_note) on public.dsr_requests from authenticated;
grant select (booking_id, acknowledged_at, fulfil_due_at, outcome) on public.dsr_requests to authenticated;

alter table public.security_events drop constraint security_events_event_type_check;
alter table public.security_events add constraint security_events_event_type_check check (event_type in (
  'webhook_signature_invalid','webhook_amount_mismatch','status_disagreement','login_failed','login_locked',
  'mfa_failed','mfa_enrolled','scanner_invalid_signature','scanner_lockout','rate_limited','turnstile_failed',
  'upload_rejected','role_changed','staff_disabled','key_rotated','export_downloaded','pii_revealed',
  'manual_checkin','manual_backfill','undo_check_in','cron_failed','notification_dead','price_changed',
  'session_changed_with_bookings','quota_pressure','mfa_reset','notification_blocked','upload_sanitized',
  'mfa_locked','session_revoke_failed','manual_lookup','alert_self_ack_sole_superadmin','invite_claimed',
  'dsr_handled'));


-- ===== Shared steps =====

-- The superadmin at AAL2, with a fresh TOTP code for a step that deletes or hands out personal data.
create function internal.require_dsr_handler(p_needs_fresh_code boolean) returns void
  language plpgsql stable
  set search_path = ''
as $$
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'only the superadmin handles data requests' using errcode = '42501';
  end if;
  if p_needs_fresh_code and not internal.has_fresh_totp() then
    raise exception 'confirm with a fresh authenticator code first' using errcode = '42501';
  end if;
end;
$$;

-- The request p_request_id, locked, in one of p_statuses and with its identity confirmed or not as p_verified asks.
create function internal.dsr_request_for(p_request_id uuid, p_statuses text[], p_verified boolean)
  returns public.dsr_requests
  language plpgsql
  set search_path = ''
as $$
declare
  request public.dsr_requests;
begin
  select * into request from public.dsr_requests r where r.id = p_request_id for update;
  if not found then
    raise exception 'no data request %', p_request_id using errcode = 'P0002';
  end if;
  if not (request.status = any (p_statuses))
     or (p_verified is not null and (request.verified_at is not null) is distinct from p_verified) then
    raise exception 'this data request is not at that step' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return request;
end;
$$;

-- One step of a request: an audit row and a dsr_handled security event, by the superadmin acting.
create function internal.record_dsr_step(p_request public.dsr_requests, p_step text, p_details jsonb)
  returns void
  language plpgsql
  set search_path = ''
as $$
declare
  details jsonb := jsonb_build_object('request_id', p_request.id, 'booking_id', p_request.booking_id,
                                      'request_type', p_request.request_type, 'step', p_step)
                   || coalesce(p_details, '{}');
begin
  insert into public.security_events (event_type, severity, actor_id, entity_type, entity_id, details)
  values ('dsr_handled',
          case when p_step in ('participants_deleted', 'anonymised', 'exported') then 'high' else 'medium' end
            ::public.alert_severity,
          auth.uid(), 'dsr_requests', p_request.id::text, details);
  perform internal.log_audit('dsr.' || p_step, 'dsr_requests', p_request.id::text, details - 'request_id');
end;
$$;

-- The guest hears that the request moved on: a link to /reservasi/<code>/privasi on the booking's verified number,
-- manage while the identity is still to be confirmed, view afterwards. Null when nothing could be queued.
create function internal.notify_dsr_guest(p_request public.dsr_requests, p_scope text) returns uuid
  language sql
  set search_path = ''
as $$
  select case when p_request.booking_id is null then null else
    internal.enqueue_notification(p_request.booking_id, 'booking_link', 'whatsapp',
                                  jsonb_build_object('link_scope', p_scope, 'link_page', 'privasi'),
                                  'dsr:' || p_request.id || ':' || p_request.status)
  end;
$$;

-- Finishes a request with its outcome and the superadmin's note, and tells the guest when they proved who they are.
create function internal.finish_dsr(p_request public.dsr_requests, p_outcome text, p_note text) returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  finished public.dsr_requests;
begin
  if length(btrim(coalesce(p_note, ''))) not between 10 and 2000 then
    raise exception 'a data request is closed with a note of 10 to 2000 characters' using errcode = '22023';
  end if;
  update public.dsr_requests r
  set status = case when p_outcome like 'rejected_%' then 'rejected' else 'completed' end,
      outcome = p_outcome, resolution_note = btrim(p_note), handled_by = auth.uid(), handled_at = now()
  where r.id = p_request.id
  returning * into finished;
  perform internal.record_dsr_step(finished, p_outcome, null);
  return case when finished.verified_at is null then null else internal.notify_dsr_guest(finished, 'view') end;
end;
$$;

-- The booking's participants go, and the certificates that print a person's name are marked purged, so
-- api/jobs/purge-storage removes their files (internal.purgeable_files) as it does after 90 days. With p_every_name,
-- the group certificates too, which print the booker's name for an individual. Returns how many participants went.
create function internal.forget_booking_participants(p_booking_id uuid, p_every_name boolean) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  deleted integer;
begin
  update public.certificates c set participant_id = null, recipient_name = '[dihapus]', purged_at = now()
  where c.booking_id = p_booking_id and c.purged_at is null and (p_every_name or c.kind = 'participant');
  delete from public.booking_participants p where p.booking_id = p_booking_id;
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

-- The settings of a handling step: the superadmin is the actor, and the retention guards let the erasure through.
create function internal.begin_dsr_step() returns jsonb
  language sql
  set search_path = ''
as $$
  select internal.push_settings(jsonb_build_object('app.actor_id', auth.uid()::text, 'app.actor_role', 'superadmin',
                                                   'app.in_rpc', '1', 'app.purge', 'on',
                                                   'app.audit_mode', 'names_only'));
$$;

revoke execute on function internal.require_dsr_handler(boolean), internal.dsr_request_for(uuid, text[], boolean),
  internal.record_dsr_step(public.dsr_requests, text, jsonb), internal.notify_dsr_guest(public.dsr_requests, text),
  internal.finish_dsr(public.dsr_requests, text, text), internal.forget_booking_participants(uuid, boolean),
  internal.begin_dsr_step()
  from public, anon, authenticated, service_role;


-- ===== Intake =====

-- {request_id, notified}. The booking must still hold a verified WhatsApp number: that is where the guest confirms.
create function public.dsr_open(p_booking_id uuid, p_request_type text, p_reason text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  acknowledge_within constant interval := interval '3 days';
  booking record;
  request public.dsr_requests;
begin
  perform internal.require_dsr_handler(false);
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 2000 then
    raise exception 'a data request needs a reason of 10 to 2000 characters' using errcode = '22023';
  end if;
  if p_request_type is null
     or p_request_type not in ('access', 'rectification', 'erasure', 'restriction', 'withdraw_consent') then
    raise exception 'no such kind of data request' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  select b.id, b.booking_code, b.pic_phone, b.phone_verified_at, b.pii_purged_at into booking
  from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'no booking %', p_booking_id using errcode = 'P0002';
  end if;
  if booking.pii_purged_at is not null or booking.pic_phone is null or booking.phone_verified_at is null then
    raise exception 'the booking has no verified WhatsApp number to confirm the request from'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  insert into public.dsr_requests (request_type, phone, booking_code, booking_id, message, status, due_at)
  values (p_request_type, booking.pic_phone, booking.booking_code, booking.id, btrim(p_reason), 'received',
          now() + acknowledge_within)
  returning * into request;
  perform internal.record_dsr_step(request, 'opened', null);
  return jsonb_build_object('request_id', request.id,
                            'notified', internal.notify_dsr_guest(request, 'manage') is not null);
end;
$$;

-- The guest's code for p_booking_id, to the booking's own verified number, while a request awaits its identity.
-- The issue_phone_otp answer, or {result: none} when nothing awaits.
create function internal.issue_dsr_identity_otp(
  p_booking_id uuid, p_otp_id uuid, p_browser_hash text, p_code_hash text, p_code text, p_ip inet
) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  phone text;
begin
  perform internal.require_server_caller('issue_dsr_identity_otp');
  select b.pic_phone into phone from public.bookings b
  where b.id = p_booking_id and b.phone_verified_at is not null and b.pii_purged_at is null
    and exists (select 1 from public.dsr_requests r
                where r.booking_id = b.id and r.status = 'received' and r.verified_at is null);
  if phone is null then
    return jsonb_build_object('result', 'none');
  end if;
  return internal.issue_phone_otp(p_otp_id, 'dsr_identity', 'whatsapp', p_browser_hash, p_code_hash, p_code, phone,
                                  null, p_booking_id, p_ip);
end;
$$;

-- The guest's code checked against the booking's own number; once verified, every request of the booking that awaited
-- its identity counts from now. The verify_phone_otp answer, with how many requests it confirmed.
create function internal.confirm_dsr_identity(p_booking_id uuid, p_browser_hash text, p_code_hash text)
  returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  acknowledge_within constant interval := interval '3 days';
  fulfil_within constant interval := interval '14 days';
  phone text;
  checked jsonb;
  previous_settings jsonb;
  request public.dsr_requests;
  confirmed integer := 0;
begin
  perform internal.require_server_caller('confirm_dsr_identity');
  select b.pic_phone into phone from public.bookings b where b.id = p_booking_id and b.pii_purged_at is null;
  if phone is null then
    return jsonb_build_object('result', 'invalid');
  end if;
  checked := internal.verify_phone_otp('dsr_identity', 'whatsapp', p_browser_hash, p_code_hash, phone);
  if checked ->> 'result' <> 'verified' then
    return checked;
  end if;
  if not exists (select 1 from public.guest_otps o
                 where o.id = (checked ->> 'otp_id')::uuid and o.booking_id = p_booking_id) then
    return jsonb_build_object('result', 'invalid');
  end if;

  previous_settings := internal.push_settings('{"app.actor_role": "visitor"}');
  for request in
    update public.dsr_requests r
    set verified_at = now(), otp_id = (checked ->> 'otp_id')::uuid, due_at = now() + acknowledge_within,
        fulfil_due_at = now() + fulfil_within
    where r.booking_id = p_booking_id and r.status = 'received' and r.verified_at is null
    returning *
  loop
    insert into public.security_events (event_type, severity, entity_type, entity_id, details)
    values ('dsr_handled', 'medium', 'dsr_requests', request.id::text,
            jsonb_build_object('request_id', request.id, 'booking_id', p_booking_id, 'step', 'identity_verified'));
    perform internal.log_audit('dsr.identity_verified', 'dsr_requests', request.id::text,
                               jsonb_build_object('booking_id', p_booking_id));
    confirmed := confirmed + 1;
  end loop;
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('result', 'verified', 'confirmed', confirmed);
end;
$$;

create function public.svc_issue_dsr_identity_otp(
  p_booking_id uuid, p_otp_id uuid, p_browser_hash text, p_code_hash text, p_code text, p_ip inet default null
) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.issue_dsr_identity_otp(p_booking_id, p_otp_id, p_browser_hash, p_code_hash, p_code, p_ip); $$;

create function public.svc_confirm_dsr_identity(p_booking_id uuid, p_browser_hash text, p_code_hash text)
  returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.confirm_dsr_identity(p_booking_id, p_browser_hash, p_code_hash); $$;

revoke execute on function internal.issue_dsr_identity_otp(uuid, uuid, text, text, text, inet),
  internal.confirm_dsr_identity(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.svc_issue_dsr_identity_otp(uuid, uuid, text, text, text, inet),
  public.svc_confirm_dsr_identity(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.svc_issue_dsr_identity_otp(uuid, uuid, text, text, text, inet),
  public.svc_confirm_dsr_identity(uuid, text, text)
  to service_role;


-- ===== The queue =====

create function public.dsr_acknowledge(p_request_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  request public.dsr_requests;
begin
  perform internal.require_dsr_handler(false);
  request := internal.dsr_request_for(p_request_id, array['received'], true);
  update public.dsr_requests r
  set status = 'in_progress', acknowledged_at = now(), handled_by = auth.uid(), handled_at = now()
  where r.id = request.id
  returning * into request;
  perform internal.record_dsr_step(request, 'acknowledged', null);
end;
$$;

-- The export the server rendered and stored for this request (src/server/services/dsr-documents.ts): its two files,
-- under the booking's own folder, then the guest's view link. An access request only.
create function public.dsr_record_export(p_request_id uuid, p_json_path text, p_pdf_path text, p_note text)
  returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  request public.dsr_requests;
  folder text;
  notified uuid;
begin
  perform internal.require_dsr_handler(true);
  request := internal.dsr_request_for(p_request_id, array['in_progress'], true);
  if request.request_type <> 'access' then
    raise exception 'an export answers an access request' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  folder := format('bookings/%s/dsr/%s', request.booking_id, request.id);
  if p_json_path is distinct from folder || '.json' or p_pdf_path is distinct from folder || '.pdf' then
    raise exception 'an export is stored under its own booking and request' using errcode = '22023';
  end if;
  update public.dsr_requests r set export_json_path = p_json_path, export_pdf_path = p_pdf_path
  where r.id = request.id
  returning * into request;
  notified := internal.finish_dsr(request, 'exported', p_note);
  return jsonb_build_object('stage', 'completed', 'notified', notified is not null);
end;
$$;

-- Deletes the booking's participants (an erasure or a withdrawn consent).
create function public.dsr_delete_participants(p_request_id uuid, p_note text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  request public.dsr_requests;
  previous_settings jsonb;
  booking_status public.booking_status;
  deleted integer;
  notified uuid;
begin
  perform internal.require_dsr_handler(true);
  request := internal.dsr_request_for(p_request_id, array['in_progress'], true);
  if request.request_type not in ('erasure', 'withdraw_consent') then
    raise exception 'participants are deleted for an erasure or a withdrawn consent'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  perform internal.take_audit_turn();
  select b.status into booking_status from public.bookings b where b.id = request.booking_id for update;
  previous_settings := internal.begin_dsr_step();
  deleted := internal.forget_booking_participants(request.booking_id, false);
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (request.booking_id, booking_status, booking_status, 'admin', auth.uid(), 'dsr_participants_deleted',
          jsonb_build_object('request_id', request.id, 'participants_deleted', deleted));
  perform internal.restore_settings(previous_settings);
  notified := internal.finish_dsr(request, 'participants_deleted', p_note);
  return jsonb_build_object('stage', 'completed', 'participants_deleted', deleted, 'notified', notified is not null);
end;
$$;

-- An erasure before the retention run would get to it, paid bookings too: the booking's contact, its free text, its
-- participants and every certificate that prints a name, the outbox rows that still carry the contact, and every guest
-- link (token_version). The invoices, receipts, credit notes and quotations keep their snapshots and files under the
-- 10-year financial retention, which the note records and the guest's page states. The guest's last message is queued
-- first, while the booking still names its number, and is the one outbox row kept.
create function public.dsr_anonymise_booking(p_request_id uuid, p_note text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  request public.dsr_requests;
  previous_settings jsonb;
  booking_status public.booking_status;
  deleted integer;
  notified uuid;
begin
  perform internal.require_dsr_handler(true);
  request := internal.dsr_request_for(p_request_id, array['in_progress'], true);
  if request.request_type <> 'erasure' then
    raise exception 'a booking is anonymised for an erasure request' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  perform internal.take_audit_turn();
  select b.status into booking_status from public.bookings b
  where b.id = request.booking_id and b.pii_purged_at is null for update;
  if not found then
    raise exception 'the booking is anonymised already' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  notified := internal.finish_dsr(request, 'anonymised', p_note);

  previous_settings := internal.begin_dsr_step();
  deleted := internal.forget_booking_participants(request.booking_id, true);
  update public.bookings b
  set pic_name = 'anon', pic_phone = null, pic_email = null, phone_verified_at = null, email_verified_at = null,
      notes = null, admin_notes = null, cancel_reason = null, review_reason = null, discount_note = null,
      source_ip = null, user_agent = null, pii_purged_at = now(), token_version = b.token_version + 1
  where b.id = request.booking_id;
  update public.booking_addons ad set notes = null where ad.booking_id = request.booking_id and ad.notes is not null;
  delete from public.notifications n where n.booking_id = request.booking_id and n.id is distinct from notified;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (request.booking_id, booking_status, booking_status, 'admin', auth.uid(), 'dsr_anonymised',
          jsonb_build_object('request_id', request.id, 'participants_deleted', deleted));
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('stage', 'completed', 'participants_deleted', deleted, 'notified', notified is not null);
end;
$$;

-- Finishes a request without a database action: a rectification done with the existing staff edits, or a refusal.
-- A request whose identity was never confirmed can only be refused as such, and its guest hears nothing.
create function public.dsr_close(p_request_id uuid, p_outcome text, p_note text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  request public.dsr_requests;
  notified uuid;
begin
  perform internal.require_dsr_handler(false);
  if p_outcome is null or p_outcome not in ('rectified', 'rejected_identity', 'rejected_other') then
    raise exception 'a request is closed here as rectified or refused' using errcode = '22023';
  end if;
  request := internal.dsr_request_for(p_request_id, array['received', 'in_progress'],
                                      case p_outcome when 'rejected_identity' then false
                                                     when 'rectified' then true end);
  if p_outcome = 'rectified' and (request.status <> 'in_progress'
                                  or request.request_type not in ('rectification', 'restriction')) then
    raise exception 'a rectification closes an acknowledged rectification or restriction request'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  notified := internal.finish_dsr(request, p_outcome, p_note);
  return jsonb_build_object('stage', case when p_outcome like 'rejected_%' then 'rejected' else 'completed' end,
                            'notified', notified is not null);
end;
$$;

revoke execute on function public.dsr_open(uuid, text, text), public.dsr_acknowledge(uuid),
  public.dsr_record_export(uuid, text, text, text), public.dsr_delete_participants(uuid, text),
  public.dsr_anonymise_booking(uuid, text), public.dsr_close(uuid, text, text)
  from public, anon, service_role;
grant execute on function public.dsr_open(uuid, text, text), public.dsr_acknowledge(uuid),
  public.dsr_record_export(uuid, text, text, text), public.dsr_delete_participants(uuid, text),
  public.dsr_anonymise_booking(uuid, text), public.dsr_close(uuid, text, text)
  to authenticated;
