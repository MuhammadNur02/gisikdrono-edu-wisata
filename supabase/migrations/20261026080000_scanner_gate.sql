-- Task P4.4.02 (docs/PRD.md FR-SCAN-07, FR-SCAN-10; docs/Security.md §9.2, §9.3; CLAUDE.md §7.4; QR-06, RL-03) and the
-- re-review of PR #53. POST /api/tickets/verify runs on the officer's own session, never the service role, so the
-- scanner's limits live here as staff RPCs:
--
--   claim_scanner_turn      every scan request asks for its turn first: 120 requests a minute per officer
--                           (fail-closed, internal.rate_limit_hit), and past 30 distinct bad QR payloads in five
--                           minutes a slow-down of 1 s, 2 s, then 5 s after each bad one, never a lock, with one
--                           high scanner_lockout event. A bad payload is a QR scan ticket_scans recorded as
--                           invalid_signature or not_found; ticket_scans keeps its hash, so "distinct" needs no store
--                           of its own.
--   unlock_scanner_officer  the superadmin's "buka kunci petugas": the bad payloads before it no longer count.
--   scan_ticket             the route's one call for a preview or a commit, every optional argument defaulted.
--
-- And the Lows of the re-review of PR #53:
--   (a) find_manual_ticket counts wrong last-four only from officers of one of the booking's RWs, the only ones it could
--       ever answer with a ticket, and the superadmin is never held by that cap. An officer of another RW cannot lock a
--       booking's manual check-in or learn from the cap that its code exists.
--   (b) the verdict asks for the payment behind the booking (L2): a settled one, or one partly refunded, after which
--       the booking stays paid and its tickets valid (record_refund). The same rule tickets_require_paid_booking
--       applied when the ticket was issued, taken again at the gate.
--   (d) revoke_certificate also takes a certificate an undone check-in revoked, and clears its flag, so the
--       superadmin's revocation sticks when the group is let in again.


-- ===== The scanner's turn =====

create index ticket_scans_officer_time_idx on public.ticket_scans (scanned_by, scanned_at desc);

create function internal.scanner_turn(p_allowed boolean, p_retry_after_seconds integer) returns jsonb
  language sql immutable
  set search_path = ''
as $$ select jsonb_build_object('allowed', p_allowed, 'retry_after_seconds', p_retry_after_seconds); $$;

-- Since when an officer's bad payloads count: the last five minutes, or since the superadmin last unlocked them.
create function internal.scanner_window_start(p_officer uuid) returns timestamptz
  language sql stable
  set search_path = ''
as $$
  select greatest(now() - interval '5 minutes',
                  coalesce((select max(a.occurred_at) from public.audit_logs a
                            where a.action = 'scanner.unlock' and a.entity_type = 'profiles'
                              and a.entity_id = p_officer::text), '-infinity'::timestamptz));
$$;

-- One high scanner_lockout event per window, however long the officer keeps scanning bad payloads.
create function internal.note_scanner_lockout(p_officer uuid, p_since timestamptz, p_bad_payloads integer)
  returns void
  language plpgsql
  set search_path = ''
as $$
begin
  if not exists (select 1 from public.security_events e
                 where e.event_type = 'scanner_lockout' and e.actor_id = p_officer and e.occurred_at > p_since) then
    insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
    values ('scanner_lockout', 'high', p_officer, public.app_rw_id(), 'profiles', p_officer::text,
            jsonb_build_object('bad_payloads', p_bad_payloads));
  end if;
end;
$$;

revoke execute on function internal.scanner_turn(boolean, integer), internal.scanner_window_start(uuid),
  internal.note_scanner_lockout(uuid, timestamptz, integer)
  from public, anon, authenticated, service_role;

-- FR-SCAN-10: { allowed, retry_after_seconds }. The route answers 429 with Retry-After when allowed is false. Volatile:
-- it counts the request.
create function public.claim_scanner_turn() returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  request_cap constant integer := 120;
  request_window constant integer := 60;
  bad_payloads_allowed constant integer := 30;
  slow_down_seconds constant integer[] := array[1, 2, 5];
  officer uuid := auth.uid();
  counted_since timestamptz;
  bad_payloads integer;
  last_bad_at timestamptz;
  wait_seconds integer;
begin
  perform internal.require_gate_officer();
  if not internal.rate_limit_hit('scanner:user:' || officer::text, request_cap, request_window) then
    return internal.scanner_turn(false,
                                 request_window - floor(extract(epoch from now()))::integer % request_window);
  end if;

  counted_since := internal.scanner_window_start(officer);
  select count(distinct s.raw_payload)::integer, max(s.scanned_at) into bad_payloads, last_bad_at
  from public.ticket_scans s
  where s.scanned_by = officer and s.source = 'qr' and s.result in ('invalid_signature', 'not_found')
    and s.scanned_at > counted_since;
  if bad_payloads <= bad_payloads_allowed then
    return internal.scanner_turn(true, null);
  end if;

  perform internal.note_scanner_lockout(officer, counted_since, bad_payloads);
  wait_seconds := ceil(extract(epoch from last_bad_at - now())
                       + slow_down_seconds[least(bad_payloads - bad_payloads_allowed,
                                                 array_length(slow_down_seconds, 1))])::integer;
  return case when wait_seconds > 0 then internal.scanner_turn(false, wait_seconds)
              else internal.scanner_turn(true, null) end;
end;
$$;

-- The superadmin at AAL2 clears an officer's slow-down; audited as scanner.unlock, which claim_scanner_turn reads.
create function public.unlock_scanner_officer(p_profile_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'only the superadmin unlocks an officer''s scanner' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.role in ('superadmin', 'admin_rw')) then
    raise exception 'staff member % does not exist', p_profile_id using errcode = 'P0002';
  end if;
  perform internal.take_audit_turn();
  perform internal.log_audit('scanner.unlock', 'profiles', p_profile_id::text, '{}');
end;
$$;

revoke execute on function public.claim_scanner_turn(), public.unlock_scanner_officer(uuid)
  from public, anon, service_role;
grant execute on function public.claim_scanner_turn(), public.unlock_scanner_officer(uuid) to authenticated;


-- ===== (a) find_manual_ticket =====

-- Replaces the 20261025080300 version: the wrong-last-four cap holds an officer of one of the booking's RWs only.
create or replace function public.find_manual_ticket(p_booking_code text, p_phone_last_digits text) returns jsonb
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
  is_capped boolean;
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

  select b.id, b.phone_verified_at is not null and right(b.pic_phone, 4) = p_phone_last_digits,
         not public.is_superadmin() and public.owns_any_rw(b.rw_ids)
  into found_booking, digits_match, is_capped
  from public.bookings b where b.booking_code = upper(btrim(p_booking_code));
  if found_booking is null then
    return internal.answer_manual_lookup(null, null, 'not_found');
  end if;

  if is_capped then
    booking_key := 'manual_lookup:booking:' || found_booking::text;
    perform pg_advisory_xact_lock(hashtext(booking_key));
    if internal.rate_limit_count(booking_key, wrong_digits_window) >= wrong_digits_cap then
      perform internal.rate_limit_hit(booking_key, wrong_digits_cap, wrong_digits_window);
      perform internal.note_manual_lookup_cap(booking_key, wrong_digits_cap, wrong_digits_window,
                                              'manual_lookup_booking', found_booking);
      return internal.answer_manual_lookup(found_booking, null, 'rate_limited');
    end if;
  end if;
  if not coalesce(digits_match, false) then
    if is_capped then
      perform internal.rate_limit_hit(booking_key, wrong_digits_cap, wrong_digits_window);
    end if;
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


-- ===== (b) the money behind the ticket =====

-- Replaces the 20261025080100 version: after the booking's status, the payment behind it.
create or replace function internal.ticket_verdict(p_ticket_id uuid, p_source text, p_override boolean)
  returns public.scan_result
  language plpgsql stable
  set search_path = ''
as $$
declare
  ticket record;
begin
  if p_ticket_id is null then
    return case when p_source = 'manual' then 'not_found' else 'invalid_signature' end;
  end if;
  select t.rw_id, t.status, t.valid_on, t.valid_from, t.valid_until, t.booking_id, b.status as booking_status
  into ticket
  from public.tickets_qr t join public.bookings b on b.id = t.booking_id
  where t.id = p_ticket_id;
  if not found then
    return 'not_found';
  end if;
  if not (public.is_superadmin() or public.owns_rw(ticket.rw_id)) then
    return 'wrong_rw';
  end if;
  case ticket.status
    when 'revoked' then return 'revoked';
    when 'suspended' then return 'suspended';
    when 'used' then return 'already_used';
    when 'expired' then return 'ticket_expired';
    else null;
  end case;
  if ticket.booking_status not in ('paid', 'checked_in')
     or not exists (select 1 from public.payments p
                    where p.booking_id = ticket.booking_id and p.status in ('settled', 'partially_refunded')) then
    return 'booking_not_paid';
  end if;
  if p_override and public.is_superadmin() then
    return 'ok';
  end if;
  if ticket.valid_on <> public.today_jkt() then
    return 'wrong_date';
  end if;
  return case when now() between ticket.valid_from and ticket.valid_until then 'ok' else 'outside_window' end;
end;
$$;


-- ===== (d) a revocation that sticks =====

-- Replaces the 20261025080000 version: a certificate an undone check-in revoked is revoked again under the
-- superadmin's reason, its flag cleared, so issue_certificates never brings it back.
create or replace function public.revoke_certificate(p_certificate_id uuid, p_reason text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  certificate record;
  previous_settings jsonb;
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'only the superadmin revokes a certificate' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'a revocation needs a reason of 3 to 300 characters' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  select c.id, c.status, c.revoked_by_undo into certificate
  from public.certificates c where c.id = p_certificate_id for update;
  if not found then
    raise exception 'certificate % does not exist', p_certificate_id using errcode = 'P0002';
  end if;
  if certificate.status <> 'issued' and not certificate.revoked_by_undo then
    raise exception 'the certificate is already revoked' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  previous_settings := internal.push_settings('{"app.in_rpc": "1"}');
  update public.certificates
  set status = 'revoked', revoked_at = now(), revoke_reason = btrim(p_reason), revoked_by_undo = false
  where id = p_certificate_id;
  perform internal.restore_settings(previous_settings);
end;
$$;


-- ===== One entry for the route =====

-- POST /api/tickets/verify's call: the preview or the commit of one scan, with every argument the route may leave out
-- defaulted, so a QR whose signature failed and a manual lookup that found nothing pass no ticket at all.
-- validate_ticket and check_in_ticket keep their own checks; this only chooses between them.
create function public.scan_ticket(
  p_mode text, p_attempt_id uuid, p_source text, p_raw text default null, p_device jsonb default '{}',
  p_ticket_id uuid default null, p_attendee_count integer default null, p_override_reason text default null
) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.require_gate_officer();
  case p_mode
    when 'preview' then
      return public.validate_ticket(p_ticket_id, p_attempt_id, p_raw, p_device, p_source);
    when 'commit' then
      return public.check_in_ticket(p_ticket_id, p_attempt_id, p_attendee_count, null, p_device,
                                    p_override_reason is not null, p_override_reason, p_source, p_raw);
    else
      raise exception 'a scan is a preview or a commit' using errcode = '22023';
  end case;
end;
$$;

revoke execute on function public.scan_ticket(text, uuid, text, text, jsonb, uuid, integer, text)
  from public, anon, service_role;
grant execute on function public.scan_ticket(text, uuid, text, text, jsonb, uuid, integer, text) to authenticated;
