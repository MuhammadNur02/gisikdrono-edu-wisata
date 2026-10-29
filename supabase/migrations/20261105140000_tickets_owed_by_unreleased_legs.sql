-- Follow-up of the last review of PR #109, item 1 (docs/Security.md §11.2, R1): a paid booking owes tickets while it
-- has a leg that is not `released`, not only a `reserved` or `checked_in` one. A booking marked paid by a fault while
-- its legs are still `unreserved` has taken money for no seat and no ticket, and must raise the critical
-- paid_without_tickets alert. A booking paid after its seats were gone keeps its legs `released`, so it still owes no
-- ticket, and the PAID_AFTER_EXPIRY_NO_QUOTA exclusion of 20261105130300 stays.


-- ===== paid_without_tickets in the anomaly scan =====

-- Replaces the 20261105130700 version: a booking owes tickets while any leg is not `released`. Everything else is
-- unchanged.
create or replace function internal.anomaly_money_and_tickets() returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  batch constant integer := 200;
  hit record;
  raised integer := 0;
begin
  for hit in
    select b.id from public.bookings b
    where b.status = 'paid' and b.review_reason is distinct from 'PAID_AFTER_EXPIRY_NO_QUOTA'
      and b.paid_at < now() - interval '10 minutes'
      and not exists (select 1 from public.tickets_qr t where t.booking_id = b.id)
      and exists (select 1 from public.booking_legs owed
                  where owed.booking_id = b.id and owed.status <> 'released')
    limit batch
  loop
    perform internal.raise_anomaly('paid_without_tickets', 'critical', hit.id::text, 'Lunas tanpa tiket',
                                   jsonb_build_object('booking_id', hit.id));
    raised := raised + 1;
  end loop;
  for hit in
    select t.id, t.booking_id from public.tickets_qr t
    where t.status = 'issued'
      and not exists (select 1 from public.payments p
                      where p.booking_id = t.booking_id and p.status in ('settled', 'partially_refunded'))
    limit batch
  loop
    perform internal.raise_anomaly('ticket_without_payment', 'critical', hit.id::text, 'Tiket tanpa pembayaran',
                                   jsonb_build_object('ticket_id', hit.id, 'booking_id', hit.booking_id));
    raised := raised + 1;
  end loop;
  return raised;
end;
$$;


-- ===== paid_without_tickets in the nightly reconciliation =====

-- Replaces the 20261105130700 version: the same rule. Every other invariant is unchanged.
create or replace function internal.reconcile_invariant_findings()
  returns table (issue_type text, severity public.alert_severity, booking_id uuid, payment_id uuid, facts jsonb,
                 details jsonb)
  language sql stable
  set search_path = ''
as $$
  select 'invoice_mismatch', 'high'::public.alert_severity, p.booking_id, p.id, invoiced.said, invoiced.said
  from public.payments p
  cross join lateral (
    select count(*) filter (where i.status = 'paid') as paid,
           count(*) filter (where i.status = 'void' and i.credit_note_number is not null) as credited
    from public.invoices i where i.payment_id = p.id) as counted
  cross join lateral (select jsonb_build_object('order_id', p.order_id, 'paid_invoices', counted.paid,
                                                'credited_invoices', counted.credited) as said) as invoiced
  where (p.status = 'settled' and counted.paid <> 1)
     or (p.status in ('partially_refunded', 'refunded') and counted.paid + counted.credited <> 1)
  union all
  select 'duplicate_settlement', 'high'::public.alert_severity, p.booking_id, null::uuid,
         jsonb_build_object('settled_payments', count(*)), jsonb_build_object('settled_payments', count(*))
  from public.payments p
  where p.status in ('settled', 'partially_refunded')
  group by p.booking_id
  having count(*) > 1
  union all
  select 'ledger_sum_mismatch', 'high'::public.alert_severity, sums.booking_id, null::uuid,
         jsonb_build_object('expected', sums.expected, 'ledger', sums.ledger),
         jsonb_build_object('expected', sums.expected, 'ledger', sums.ledger, 'gap', sums.ledger - sums.expected)
  from (select b.id as booking_id,
               b.total_amount - internal.booking_refunded(b.id) - internal.weather_refund_fees(b.id) as expected,
               coalesce((select sum(e.amount) from public.revenue_share_entries e where e.booking_id = b.id),
                        0)::bigint as ledger
        from public.bookings b
        where b.paid_at is not null) as sums
  where sums.ledger <> sums.expected
  union all
  -- Ten minutes, as the anomaly scan waits: the settlement writes the tickets in its own transaction. Only a booking
  -- paid after its seats were gone has no tickets on purpose, until resolve_booking_review; one under any other review
  -- (REVENUE_RULE_REFUSED among them) still owes them, for every leg not `released`, an `unreserved` one included.
  select 'paid_without_tickets', 'critical'::public.alert_severity, b.id, null::uuid, legs.said, legs.said
  from public.bookings b
  cross join lateral (select jsonb_build_object('legs', count(*), 'pax', coalesce(sum(l.pax_count), 0)) as said
                      from public.booking_legs l where l.booking_id = b.id) as legs
  where b.status = 'paid' and b.review_reason is distinct from 'PAID_AFTER_EXPIRY_NO_QUOTA'
    and b.paid_at < now() - interval '10 minutes'
    and not exists (select 1 from public.tickets_qr t where t.booking_id = b.id)
    and exists (select 1 from public.booking_legs owed
                where owed.booking_id = b.id and owed.status <> 'released')
  union all
  select 'ticket_without_payment', 'critical'::public.alert_severity, t.booking_id, null::uuid,
         jsonb_build_object('ticket_id', t.id),
         jsonb_build_object('ticket_id', t.id, 'booking_status', b.status)
  from public.tickets_qr t
  join public.bookings b on b.id = t.booking_id
  where t.status = 'issued' and b.status not in ('paid', 'checked_in')
  union all
  -- The counts move with every booking: an open issue is about the session and its capacity, while a closing as
  -- ignored covers only the counts it was closed on (reconciliation_issue_said).
  select 'capacity_exceeded', 'high'::public.alert_severity, null::uuid, null::uuid,
         jsonb_build_object('session_id', s.id, 'capacity', s.capacity),
         jsonb_build_object('session_id', s.id, 'capacity', s.capacity, 'reserved_pax', s.reserved_pax,
                            'legs_pax', legs.pax)
  from public.visit_sessions s
  cross join lateral (select coalesce(sum(l.pax_count), 0)::integer as pax from public.booking_legs l
                      where l.visit_session_id = s.id and l.status in ('reserved', 'checked_in')) as legs
  where s.session_date >= public.today_jkt() and (s.reserved_pax > s.capacity or legs.pax > s.capacity);
$$;
