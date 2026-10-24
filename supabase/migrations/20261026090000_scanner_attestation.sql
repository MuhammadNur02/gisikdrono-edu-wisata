-- Independent review of PR #54, M1 (CLAUDE.md §7.4; docs/Security.md §9.2, §9.3; QR-02, QR-06): validate_ticket,
-- check_in_ticket and scan_ticket were all granted to authenticated, and none asked for the scanner's turn, so an
-- officer at AAL2 could call rpc/scan_ticket with a ticket id read through tickets_qr_staff_read and check a group in
-- with no signed QR, no last four digits, no manual_checkin event and no limit. Still no service role on this path:
--
--   * scan_ticket is the one entry point. validate_ticket, check_in_ticket and the turn (now internal.
--     claim_scanner_turn) are no longer executable by authenticated; scan_ticket asks for the turn itself.
--   * A scan that names a ticket carries the route's attestation: HMAC-SHA256(K, officer | ticket | attempt | mode |
--     source | expires_at), hex, which POST /api/tickets/verify makes only after it checked the QR's HMAC in Node or
--     find_manual_ticket found the ticket, and which expires 60 s later. K = HMAC-SHA256(CRON_SECRET,
--     'gsk-scanner-attest-v1'): CRON_SECRET is already in Vercel's env and in Vault as cron_secret, so no new secret
--     is provisioned, and rotating CRON_SECRET rotates K (src/lib/scanner/attest.ts is the Node side). An attestation
--     that is missing, expired, bound to another officer, ticket, attempt, mode or source, or made without a key in
--     Vault turns the scan into an invalid_signature one: recorded, counted toward the slow-down, and a
--     scanner_invalid_signature security event.
--   * A manual commit attests the ticket its own preview recorded, so a manual check-in costs one lookup (L4).


-- ===== The turn is scan_ticket's =====

revoke execute on function public.claim_scanner_turn() from authenticated;
alter function public.claim_scanner_turn() set schema internal;
revoke execute on function internal.claim_scanner_turn() from public, anon, authenticated, service_role;

revoke execute on function public.validate_ticket(uuid, uuid, text, jsonb, text),
  public.check_in_ticket(uuid, uuid, integer, text, jsonb, boolean, text, text, text)
  from authenticated;

drop function public.scan_ticket(text, uuid, text, text, jsonb, uuid, integer, text);


-- ===== The attestation =====

-- K, derived from CRON_SECRET in Vault; null when Vault has none, and then no attestation verifies.
create function internal.scanner_attestation_key() returns bytea
  language sql stable security definer
  set search_path = ''
as $$
  select extensions.hmac(convert_to('gsk-scanner-attest-v1', 'UTF8'), convert_to(s.decrypted_secret, 'UTF8'),
                         'sha256')
  from vault.decrypted_secrets s where s.name = 'cron_secret';
$$;

-- The attestation of one scan, as src/lib/scanner/attest.ts makes it; null without a key.
create function internal.scanner_attestation(
  p_officer uuid, p_ticket_id uuid, p_attempt_id uuid, p_mode text, p_source text, p_expires_at bigint
) returns text
  language sql stable
  set search_path = ''
as $$
  select encode(extensions.hmac(convert_to(concat_ws('|', p_officer, p_ticket_id, p_attempt_id, p_mode, p_source,
                                                     p_expires_at), 'UTF8'),
                                internal.scanner_attestation_key(), 'sha256'), 'hex');
$$;

-- Why an attestation does not hold, or null when it does. The comparison runs on HMACs of both values under a key of
-- this call, so its timing says nothing of the expected value.
create function internal.scan_attestation_problem(
  p_ticket_id uuid, p_attempt_id uuid, p_mode text, p_source text, p_attestation text, p_expires_at bigint
) returns text
  language plpgsql
  set search_path = ''
as $$
declare
  ttl_ceiling_seconds constant integer := 120;
  expected text;
  compare_key bytea := extensions.gen_random_bytes(32);
  now_seconds bigint := floor(extract(epoch from now()))::bigint;
begin
  if p_attestation is null or p_expires_at is null then
    return 'missing';
  end if;
  if p_expires_at < now_seconds or p_expires_at > now_seconds + ttl_ceiling_seconds then
    return 'expired';
  end if;
  expected := internal.scanner_attestation(auth.uid(), p_ticket_id, p_attempt_id, p_mode, p_source, p_expires_at);
  if expected is null then
    return 'no_key';
  end if;
  if extensions.hmac(convert_to(p_attestation, 'UTF8'), compare_key, 'sha256')
     <> extensions.hmac(convert_to(expected, 'UTF8'), compare_key, 'sha256') then
    return 'mismatch';
  end if;
  return null;
end;
$$;

-- A scan that named a ticket without the route's word for it: someone called the RPC around the route.
create function internal.note_unattested_scan(p_ticket_id uuid, p_problem text) returns void
  language sql
  set search_path = ''
as $$
  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('scanner_invalid_signature', 'high', auth.uid(), public.app_rw_id(), 'tickets_qr', p_ticket_id::text,
          jsonb_build_object('reason', 'attestation_' || p_problem));
$$;

revoke execute on function internal.scanner_attestation_key(),
  internal.scanner_attestation(uuid, uuid, uuid, text, text, bigint),
  internal.scan_attestation_problem(uuid, uuid, text, text, text, bigint),
  internal.note_unattested_scan(uuid, text)
  from public, anon, authenticated, service_role;


-- ===== The one entry point =====

create function internal.dispatch_scan(
  p_mode text, p_attempt_id uuid, p_source text, p_raw text, p_device jsonb, p_ticket_id uuid,
  p_attendee_count integer, p_override_reason text
) returns jsonb
  language plpgsql
  set search_path = ''
as $$
begin
  if p_mode = 'preview' then
    return public.validate_ticket(p_ticket_id, p_attempt_id, p_raw, p_device, p_source);
  end if;
  return public.check_in_ticket(p_ticket_id, p_attempt_id, p_attendee_count, null, p_device,
                                p_override_reason is not null, p_override_reason, p_source, p_raw);
end;
$$;
revoke execute on function internal.dispatch_scan(text, uuid, text, text, jsonb, uuid, integer, text)
  from public, anon, authenticated, service_role;

-- POST /api/tickets/verify's one call. The turn first (120 a minute, the slow-down past 30 distinct bad payloads):
-- a slowed officer gets {slowed, retry_after_seconds} and nothing is read or recorded. Then a scan that names a ticket
-- needs its attestation; without one it is scanned as a QR whose signature failed, under a payload of its own
-- attempt, so each such call counts as a distinct bad payload. A scan that names no ticket (a forged
-- QR, a manual lookup that found nothing) needs none: it can only be refused.
create function public.scan_ticket(
  p_mode text, p_attempt_id uuid, p_source text, p_raw text default null, p_device jsonb default '{}',
  p_ticket_id uuid default null, p_attendee_count integer default null, p_override_reason text default null,
  p_attestation text default null, p_expires_at bigint default null
) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  turn jsonb;
  problem text;
begin
  perform internal.require_gate_officer();
  if p_mode is null or p_mode not in ('preview', 'commit') then
    raise exception 'a scan is a preview or a commit' using errcode = '22023';
  end if;
  turn := internal.claim_scanner_turn();
  if not (turn ->> 'allowed')::boolean then
    return jsonb_build_object('slowed', true, 'retry_after_seconds', turn -> 'retry_after_seconds');
  end if;
  if p_ticket_id is not null then
    problem := internal.scan_attestation_problem(p_ticket_id, p_attempt_id, p_mode, p_source, p_attestation,
                                                 p_expires_at);
  end if;
  if problem is not null then
    perform internal.note_unattested_scan(p_ticket_id, problem);
    return internal.dispatch_scan(p_mode, p_attempt_id, 'qr', 'unattested:' || p_attempt_id::text,
                                  p_device, null, p_attendee_count, null);
  end if;
  return internal.dispatch_scan(p_mode, p_attempt_id, p_source, p_raw, p_device, p_ticket_id, p_attendee_count,
                                p_override_reason);
end;
$$;

revoke execute on function public.scan_ticket(text, uuid, text, text, jsonb, uuid, integer, text, text, bigint)
  from public, anon, service_role;
grant execute on function public.scan_ticket(text, uuid, text, text, jsonb, uuid, integer, text, text, bigint)
  to authenticated;
