-- Task P3.9.02 (docs/Security.md §3.7; WH-13, MON-04, EP-02): what POST /api/jobs/payments-poll asks the Status API
-- about every five minutes, and the housekeeping that runs with it. The poll records each answer as a payment_events
-- row of its own (source poll) and applies it through internal.apply_payment_event, which takes the body as its own
-- confirmation, so a notification Midtrans never delivered still pays the booking.


-- The orders to ask about, oldest first: open attempts between two minutes and two days old (younger ones are still
-- being paid, older ones Midtrans has closed), and settled payments of paid bookings that still lack a leg's ticket or
-- their ledger (Task P3.10.04). A booking under review waits for its superadmin rather than being asked every run.
create function internal.payments_to_poll(p_limit integer) returns table (order_id text, reason text)
  language sql stable
  set search_path = ''
as $$
  (select p.order_id, 'open' from public.payments p
   where p.provider = 'midtrans' and p.status in ('pending', 'needs_review')
     and p.created_at between now() - interval '48 hours' and now() - interval '2 minutes'
   order by p.created_at
   limit p_limit)
  union all
  (select p.order_id, 'paid_incomplete' from public.payments p
   join public.bookings b on b.id = p.booking_id
   where p.provider = 'midtrans' and p.status = 'settled' and b.status in ('paid', 'checked_in') and not b.needs_review
     and p.settlement_time < now() - interval '2 minutes'
     and (exists (select 1 from public.booking_legs l
                  where l.booking_id = b.id and l.status in ('reserved', 'checked_in')
                    and not exists (select 1 from public.tickets_qr t where t.booking_leg_id = l.id))
          or not exists (select 1 from public.revenue_share_entries e
                         where e.booking_id = b.id and e.entry_type = 'settlement'))
   order by p.settlement_time
   limit p_limit);
$$;

-- What the poll does besides asking Midtrans. A ticket still issued on a booking that is no longer paid (a bug, or a
-- change made by hand) is suspended with a critical alert (MON-04). An institution's hold six hours from its deadline
-- gets one payment_reminder per channel, whose "Bayar sekarang" button the worker fills with the attempt's Snap page
-- (Task P3.11.02); a link in the params themselves would be refused by notifications_guest_guard.
create function internal.payments_housekeeping() returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  reminder_ahead constant interval := interval '6 hours';
  previous_settings jsonb;
  orphan record;
  hold record;
  suspended integer := 0;
  reminded integer := 0;
begin
  perform internal.require_server_caller('payments_housekeeping');
  perform internal.take_audit_turn();
  previous_settings := internal.begin_scheduled_job();
  for orphan in
    select distinct t.booking_id from public.tickets_qr t join public.bookings b on b.id = t.booking_id
    where t.status = 'issued' and t.valid_until > now() and b.status not in ('paid', 'checked_in')
    order by t.booking_id
  loop
    suspended := suspended + internal.suspend_booking_tickets(orphan.booking_id, 'booking_not_paid');
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('tickets_without_payment', 'critical', 'tickets_without_payment:' || orphan.booking_id,
            'Tiket masih berlaku untuk pesanan yang tidak lunas; tiketnya ditangguhkan',
            jsonb_build_object('booking_id', orphan.booking_id))
    on conflict (fingerprint) where acknowledged_at is null do update
    set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1, notified_at = null;
  end loop;

  for hold in
    select b.id from public.bookings b
    where b.status = 'pending_payment' and not b.needs_review
      and b.booker_type in ('school', 'university', 'government', 'company')
      and b.expires_at > now() and b.expires_at <= now() + reminder_ahead
      and not exists (select 1 from public.notifications n
                      where n.booking_id = b.id and n.template = 'payment_reminder')
    order by b.expires_at
  loop
    perform internal.enqueue_notification(hold.id, 'payment_reminder', 'whatsapp', '{"link_scope": "pay"}');
    perform internal.enqueue_notification(hold.id, 'payment_reminder', 'email', '{"link_scope": "pay"}');
    reminded := reminded + 1;
  end loop;
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('suspended', suspended, 'reminded', reminded);
end;
$$;

revoke execute on function internal.payments_to_poll(integer), internal.payments_housekeeping()
  from public, anon, authenticated;

create function public.svc_payments_to_poll(p_limit integer) returns table (order_id text, reason text)
  language sql security definer
  set search_path = ''
as $$ select * from internal.payments_to_poll(p_limit); $$;

create function public.svc_payments_housekeeping() returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.payments_housekeeping(); $$;

revoke execute on function public.svc_payments_to_poll(integer), public.svc_payments_housekeeping()
  from public, anon, authenticated;
grant execute on function public.svc_payments_to_poll(integer), public.svc_payments_housekeeping() to service_role;
