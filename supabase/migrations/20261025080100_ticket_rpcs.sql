-- Task P4.4.01 (docs/PRD.md FR-SCAN-03..09; docs/Security.md §9.2, §9.3; CLAUDE.md §7.4; QR-02, QR-07, QR-08, AZ-14,
-- GUEST-04): the gate. POST /api/tickets/verify (Task P4.4.02) checks the QR's HMAC in Node, where the signing keys
-- live, and then calls these staff RPCs with the session of the officer at the gate: validate_ticket for the preview,
-- check_in_ticket for the commit, find_manual_ticket for a QR nobody can read (FR-SCAN-07); undo_check_in is the
-- superadmin's (FR-SCAN-08). Each takes the officer and their RW from auth.uid() and records the attempt in
-- ticket_scans, and the same attempt gets its stored result back, so a retry after the 8 s timeout never checks a group
-- in twice (FR-SCAN-06). A QR whose signature failed reaches them without a ticket id.


-- ===== One attempt per phase =====

-- The scanner's commit reuses its preview's attemptId (src/lib/scanner/scan-flow.ts, commitOf), so an attempt is unique
-- per phase rather than once.
alter table public.ticket_scans drop constraint ticket_scans_attempt_id_key;
alter table public.ticket_scans add constraint ticket_scans_attempt_phase_key unique (attempt_id, phase);


-- ===== Helpers =====

create function internal.require_gate_officer() returns void
  language plpgsql stable
  set search_path = ''
as $$
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'tickets are checked by staff with a verified authenticator' using errcode = '42501';
  end if;
end;
$$;

-- 'manual' is the QR nobody could read (FR-SCAN-07); the superadmin's paper back-fill comes with Task P4.3.09.
create function internal.require_scan_source(p_source text) returns void
  language plpgsql immutable
  set search_path = ''
as $$
begin
  if p_source is null or p_source not in ('qr', 'manual') then
    raise exception 'a scan comes from a QR or a manual lookup' using errcode = '22023';
  end if;
end;
$$;

-- What a scan row keeps of the officer's device: its browser and platform, cut short.
create function internal.scan_device(p_device jsonb) returns jsonb
  language sql immutable
  set search_path = ''
as $$
  select case when jsonb_typeof(p_device) = 'object'
              then jsonb_strip_nulls(jsonb_build_object('user_agent', left(p_device ->> 'user_agent', 200),
                                                        'platform', left(p_device ->> 'platform', 40)))
              else '{}' end;
$$;

-- The officer's IP, when what the route passed reads as one.
create function internal.scan_ip(p_device jsonb) returns inet
  language plpgsql immutable
  set search_path = ''
as $$
begin
  return case when jsonb_typeof(p_device) = 'object' then (p_device ->> 'ip')::inet end;
exception when invalid_text_representation then
  return null;
end;
$$;

-- The result an attempt already got in this phase, or null. An attempt is the officer's own and names one ticket;
-- its reuse by anyone else, or for another ticket, is refused as a conflict.
create function internal.stored_scan_result(p_attempt_id uuid, p_phase public.scan_phase, p_ticket_id uuid)
  returns public.scan_result
  language plpgsql stable
  set search_path = ''
as $$
declare
  stored record;
begin
  if p_attempt_id is null then
    raise exception 'a scan needs its attempt id' using errcode = '22023';
  end if;
  select s.result, s.ticket_id, s.scanned_by into stored
  from public.ticket_scans s where s.attempt_id = p_attempt_id and s.phase = p_phase;
  if not found then
    return null;
  end if;
  if stored.scanned_by <> auth.uid() or (stored.ticket_id is not null and stored.ticket_id is distinct from p_ticket_id)
  then
    raise exception 'attempt % belongs to another scan', p_attempt_id using errcode = '23505';
  end if;
  return stored.result;
end;
$$;

-- One ticket_scans row. The officer's RW names the row (NULL for the superadmin), so an RW admin sees their own
-- officers' scans; a ticket id that names no ticket is kept as NULL; the payload is kept as its SHA-256, never the
-- signed token itself (review of 0005, L2).
create function internal.record_scan(
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
          case when p_raw is not null then encode(sha256(convert_to(p_raw, 'UTF8')), 'hex') end, p_device_info, p_ip);
end;
$$;


-- ===== The verdict and the answer =====

-- The gate's verdict on a ticket for the signed-in officer now (docs/Security.md §9.2). A ticket of another RW is
-- wrong_rw before anything else is said about it, so an officer learns nothing of another RW's groups (AZ-14) and the
-- route never needs a row it cannot read to check a signature. The ticket's own state comes next, so a refunded group
-- reads revoked (QR-07), a used ticket of a completed booking already_used, and an expired ticket is never offered an
-- override it could not use; then the booking; then the day and the window the ticket was issued with (grace from
-- checkin.grace_before_minutes and checkin.grace_after_minutes), which a superadmin may override (FR-SCAN-09).
create function internal.ticket_verdict(p_ticket_id uuid, p_source text, p_override boolean)
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
  select t.rw_id, t.status, t.valid_on, t.valid_from, t.valid_until, b.status as booking_status into ticket
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
  if ticket.booking_status not in ('paid', 'checked_in') then
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

-- The group card of FR-SCAN-03: the PIC's first name only, never a contact or a participant's name, and the add-ons of
-- the ticket's own RW.
create function internal.scan_ticket_card(p_ticket_id uuid) returns jsonb
  language sql stable
  set search_path = ''
as $$
  select jsonb_build_object(
    'ticket_code', t.ticket_code, 'institution_name', b.institution_name,
    'pic_first_name', coalesce(b.pic_first_name, ''), 'package_name', b.package_snapshot ->> 'name',
    'visit_date', s.session_date, 'session_start', s.start_time, 'session_end', s.end_time, 'pax_count', t.pax_count,
    'participant_count', (select count(*) from public.booking_participants p where p.booking_id = t.booking_id),
    'addons', coalesce((select jsonb_agg(jsonb_build_object('name', a.product_name_snapshot, 'quantity', a.qty)
                                         order by a.product_name_snapshot)
                        from public.booking_addons a
                        where a.booking_id = t.booking_id and a.rw_id = t.rw_id
                          and a.fulfillment_status <> 'cancelled'), '[]'))
  from public.tickets_qr t
  join public.bookings b on b.id = t.booking_id
  join public.visit_sessions s on s.id = t.visit_session_id
  where t.id = p_ticket_id;
$$;

-- What validate_ticket and check_in_ticket answer, which the route turns into src/types/scanner.ts's
-- VerifyTicketResponse: the result, the card of a ticket the officer may see, and for a used ticket when, by whom and
-- how many came.
create function internal.scan_answer(p_ticket_id uuid, p_result public.scan_result) returns jsonb
  language sql stable
  set search_path = ''
as $$
  select jsonb_build_object('result', p_result, 'ticket', null, 'used_at', null, 'used_by', null,
                            'checked_in_pax', null, 'unpaid_pax', null)
    || coalesce((
      select jsonb_build_object('ticket', internal.scan_ticket_card(t.id))
        || case when t.status = 'used'
                then jsonb_build_object('used_at', t.checked_in_at, 'used_by', p.full_name,
                                        'checked_in_pax', t.checked_in_pax, 'unpaid_pax', t.unpaid_pax)
                else '{}' end
      from public.tickets_qr t
      left join public.profiles p on p.id = t.checked_in_by
      where t.id = p_ticket_id and p_result not in ('invalid_signature', 'not_found', 'wrong_rw', 'forbidden')), '{}');
$$;


-- ===== Check-in =====

-- FR-SCAN-04: lets a group in. The ticket is used with the count the officer confirmed, up to twice the booking with the
-- people above it recorded as unpaid (QR-08); its leg is checked in and its session counts them; the booking is
-- checked_in at its first leg, which sends checked_in_thanks; the certificates follow the last leg. The caller holds
-- the audit turn, the booking's row and the ticket's.
create function internal.admit_group(p_ticket_id uuid, p_attendee_count integer, p_note text) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  ticket record;
  previous_settings jsonb;
begin
  select t.booking_id, t.booking_leg_id, t.visit_session_id, t.pax_count, b.status as booking_status into ticket
  from public.tickets_qr t join public.bookings b on b.id = t.booking_id where t.id = p_ticket_id;
  if p_attendee_count is null or p_attendee_count not between 1 and 2 * ticket.pax_count then
    raise exception 'between 1 and % people come in on this ticket', 2 * ticket.pax_count using errcode = '22023';
  end if;
  previous_settings := internal.push_settings('{"app.in_rpc": "1"}');
  update public.tickets_qr
  set status = 'used', checked_in_at = now(), checked_in_pax = p_attendee_count,
      unpaid_pax = greatest(0, p_attendee_count - ticket.pax_count), checked_in_by = auth.uid(),
      check_in_note = left(nullif(btrim(p_note), ''), 300)
  where id = p_ticket_id;
  update public.booking_legs set status = 'checked_in', checked_in_at = now() where id = ticket.booking_leg_id;
  update public.visit_sessions set checked_in_pax = checked_in_pax + p_attendee_count where id = ticket.visit_session_id;
  if ticket.booking_status = 'paid' then
    update public.bookings set status = 'checked_in', checked_in_at = now() where id = ticket.booking_id;
    insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id)
    values (ticket.booking_id, 'paid', 'checked_in', 'admin', auth.uid());
    perform internal.enqueue_notification(ticket.booking_id, 'checked_in_thanks', 'whatsapp', '{}');
    perform internal.enqueue_notification(ticket.booking_id, 'checked_in_thanks', 'email', '{}');
  end if;
  perform internal.issue_certificates(ticket.booking_id, null);
  perform internal.restore_settings(previous_settings);
end;
$$;

-- FR-SCAN-07 and FR-SCAN-09: a manual check-in is a security event, which the anomaly scan raises as an alert
-- (docs/Security.md §11.2), and an override is audited with what it overrode and why.
create function internal.note_admission(p_ticket_id uuid, p_source text, p_overridden public.scan_result, p_reason text)
  returns void
  language plpgsql
  set search_path = ''
as $$
begin
  if p_source = 'manual' then
    insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
    select 'manual_checkin', 'medium', auth.uid(), t.rw_id, 'tickets_qr', t.id::text,
           jsonb_build_object('booking_id', t.booking_id)
    from public.tickets_qr t where t.id = p_ticket_id;
  end if;
  if p_overridden <> 'ok' then
    perform internal.log_audit('check_in_override', 'tickets_qr', p_ticket_id::text,
                               jsonb_build_object('overridden', p_overridden, 'reason', p_reason));
  end if;
end;
$$;

revoke execute on function internal.require_gate_officer(), internal.require_scan_source(text),
  internal.scan_device(jsonb), internal.scan_ip(jsonb),
  internal.stored_scan_result(uuid, public.scan_phase, uuid),
  internal.record_scan(uuid, uuid, public.scan_phase, public.scan_result, text, integer, text, text, jsonb, inet),
  internal.ticket_verdict(uuid, text, boolean), internal.scan_ticket_card(uuid),
  internal.scan_answer(uuid, public.scan_result), internal.admit_group(uuid, integer, text),
  internal.note_admission(uuid, text, public.scan_result, text)
  from public, anon, authenticated, service_role;


-- ===== Staff RPCs =====

-- FR-SCAN-03: the preview. Writes only its ticket_scans row.
create function public.validate_ticket(
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
  result := internal.stored_scan_result(p_attempt_id, 'validate', p_ticket_id);
  if result is null then
    result := internal.ticket_verdict(p_ticket_id, p_source, false);
    perform internal.record_scan(p_attempt_id, p_ticket_id, 'validate', result, p_source, null, null, p_raw,
                                 internal.scan_device(p_device), internal.scan_ip(p_device));
  end if;
  return internal.scan_answer(p_ticket_id, result);
end;
$$;

-- FR-SCAN-04: the commit, atomic under the audit turn and the locks of the booking and its ticket. The verdict is taken
-- again under those locks, so a booking refunded since the preview is refused (QR-07). An override counts for the
-- superadmin only and needs a reason; an officer's is ignored (src/types/scanner.ts).
create function public.check_in_ticket(
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

-- FR-SCAN-07: the QR nobody can read. Today's ticket of the officer's RW for the booking, when the last four digits match
-- its verified phone; null for anything else, so a wrong code and a wrong phone read the same. The route then sends
-- that ticket, or null, through validate_ticket and check_in_ticket with p_source 'manual'.
create function public.find_manual_ticket(p_booking_code text, p_phone_last_digits text) returns uuid
  language plpgsql stable security definer
  set search_path = ''
as $$
begin
  perform internal.require_gate_officer();
  if coalesce(p_phone_last_digits, '') !~ '^[0-9]{4}$' then
    return null;
  end if;
  return (
    select t.id
    from public.bookings b
    join public.tickets_qr t on t.booking_id = b.id
    where b.booking_code = upper(btrim(p_booking_code)) and b.phone_verified_at is not null
      and right(b.pic_phone, 4) = p_phone_last_digits and t.valid_on = public.today_jkt()
      and (public.is_superadmin() or public.owns_rw(t.rw_id))
    order by now() between t.valid_from and t.valid_until desc, t.valid_from
    limit 1);
end;
$$;

-- FR-SCAN-08: puts a check-in back, everything it counted included. The booking returns to paid when no other leg is in,
-- and its certificates are revoked until every leg is in again (issue_certificates brings the same ones back).
create function internal.reopen_ticket(p_ticket record, p_reason text) returns void
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
  set status = 'revoked', revoked_at = now(), revoke_reason = internal.undo_check_in_reason()
  where booking_id = p_ticket.booking_id and status = 'issued';
  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('undo_check_in', 'medium', auth.uid(), p_ticket.rw_id, 'tickets_qr', p_ticket.id::text,
          jsonb_build_object('reason', p_reason, 'checked_in_pax', p_ticket.checked_in_pax));
end;
$$;
revoke execute on function internal.reopen_ticket(record, text) from public, anon, authenticated, service_role;

-- The superadmin at AAL2, within 15 minutes of the check-in and while the visit is still open; tickets_no_revive lets
-- a used ticket back only under app.undo_check_in.
create function public.undo_check_in(p_ticket_id uuid, p_reason text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  undo_window constant interval := interval '15 minutes';
  ticket_booking uuid;
  ticket record;
  previous_settings jsonb;
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'only the superadmin undoes a check-in' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'an undo needs a reason of 3 to 300 characters' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  select t.booking_id into ticket_booking from public.tickets_qr t where t.id = p_ticket_id;
  if not found then
    raise exception 'ticket % does not exist', p_ticket_id using errcode = 'P0002';
  end if;
  perform 1 from public.bookings b where b.id = ticket_booking for update;
  select t.id, t.booking_id, t.booking_leg_id, t.visit_session_id, t.rw_id, t.status, t.checked_in_at,
         t.checked_in_pax, b.status as booking_status into ticket
  from public.tickets_qr t join public.bookings b on b.id = t.booking_id
  where t.id = p_ticket_id for update of t;
  if ticket.status <> 'used' or ticket.booking_status <> 'checked_in' or ticket.checked_in_at < now() - undo_window then
    raise exception 'a check-in is undone within % of it, while the visit is open', undo_window
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  previous_settings := internal.push_settings('{"app.in_rpc": "1", "app.undo_check_in": "1"}');
  perform internal.reopen_ticket(ticket, btrim(p_reason));
  perform internal.restore_settings(previous_settings);
end;
$$;

revoke execute on function public.validate_ticket(uuid, uuid, text, jsonb, text),
  public.check_in_ticket(uuid, uuid, integer, text, jsonb, boolean, text, text, text),
  public.find_manual_ticket(text, text), public.undo_check_in(uuid, text)
  from public, anon, service_role;
grant execute on function public.validate_ticket(uuid, uuid, text, jsonb, text),
  public.check_in_ticket(uuid, uuid, integer, text, jsonb, boolean, text, text, text),
  public.find_manual_ticket(text, text), public.undo_check_in(uuid, text)
  to authenticated;
