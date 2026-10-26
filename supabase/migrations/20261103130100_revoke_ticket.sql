-- Task P4.3.02 (docs/PRD.md FR-ADMIN-26, §8.7 `revoke_ticket`, §9.3; moved here from P3.10.04): the superadmin takes
-- one ticket out of use with a reason and a fresh authenticator code, from the booking detail page. An issued or suspended ticket becomes revoked, so
-- the gate answers `revoked` from then on. The booking's own status is cancel's and refund's to change, never this
-- function's (decision of 2026-10-26): once every ticket of the booking is revoked, the visitor is told with
-- booking_cancelled, and the booking stays as it is until staff cancel or refund it. booking_events keeps the step
-- (with the booking's unchanged status on both sides) and the audit trigger of tickets_qr keeps the ticket's own row.

create function public.revoke_ticket(p_ticket_id uuid, p_reason text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  ticket_booking uuid;
  ticket record;
  previous_settings jsonb;
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'only the superadmin revokes a ticket' using errcode = '42501';
  end if;
  -- docs/Security.md §5.3: a revocation is a critical step, confirmed with an authenticator code from the last five
  -- minutes (review of PR #76, F-76-2).
  if not public.fresh_totp() then
    raise exception 'confirm with a fresh authenticator code first' using errcode = '42501', hint = 'FRESH_TOTP';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'a revocation needs a reason of 3 to 300 characters' using errcode = '22023';
  end if;
  -- The one lock order of every booking writer: the audit turn, the booking, then its ticket (CLAUDE.md §7.1).
  perform internal.take_audit_turn();
  select t.booking_id into ticket_booking from public.tickets_qr t where t.id = p_ticket_id;
  if not found then
    raise exception 'ticket % does not exist', p_ticket_id using errcode = 'P0002';
  end if;
  perform 1 from public.bookings b where b.id = ticket_booking for update;
  select t.id, t.booking_id, t.ticket_code, t.status, b.status as booking_status into ticket
  from public.tickets_qr t join public.bookings b on b.id = t.booking_id
  where t.id = p_ticket_id for update of t;
  if ticket.status not in ('issued', 'suspended') then
    raise exception 'only an issued or suspended ticket is revoked' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  previous_settings := internal.push_settings('{"app.in_rpc": "1"}');
  update public.tickets_qr
  set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoke_reason = btrim(p_reason)
  where id = p_ticket_id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (ticket.booking_id, ticket.booking_status, ticket.booking_status, 'admin', auth.uid(), btrim(p_reason),
          jsonb_build_object('step', 'ticket_revoked', 'ticket_code', ticket.ticket_code));
  if not exists (select 1 from public.tickets_qr t where t.booking_id = ticket.booking_id and t.status <> 'revoked') then
    perform internal.enqueue_notification(ticket.booking_id, 'booking_cancelled', 'whatsapp', '{}');
    perform internal.enqueue_notification(ticket.booking_id, 'booking_cancelled', 'email', '{}');
  end if;
  perform internal.restore_settings(previous_settings);
end;
$$;

revoke execute on function public.revoke_ticket(uuid, text) from public, anon, service_role;
grant execute on function public.revoke_ticket(uuid, text) to authenticated;
