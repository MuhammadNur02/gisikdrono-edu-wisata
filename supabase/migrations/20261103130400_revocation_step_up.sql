-- Review of PR #76, F-76-2 (docs/Security.md §5.3, :448): revoking a certificate and undoing a check-in are critical
-- steps like revoke_ticket, confirmed with an authenticator code from the last five minutes, not only an AAL2
-- session. Each function replaces its latest version (20261026080000, 20261025080100) with the check added after the
-- role check; everything else is unchanged.

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
  if not public.fresh_totp() then
    raise exception 'confirm with a fresh authenticator code first' using errcode = '42501', hint = 'FRESH_TOTP';
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

create or replace function public.undo_check_in(p_ticket_id uuid, p_reason text) returns void
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
  if not public.fresh_totp() then
    raise exception 'confirm with a fresh authenticator code first' using errcode = '42501', hint = 'FRESH_TOTP';
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
