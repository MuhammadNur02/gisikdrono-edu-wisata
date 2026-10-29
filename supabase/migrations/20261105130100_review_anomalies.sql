-- Follow-ups of the review of PR #106 (20261105100000_review_waits_for_resolution.sql; docs/PRD.md §13.1 A28;
-- docs/Security.md §11.2, R1):
--
--   anomaly_money_and_tickets   paid_without_tickets leaves out a booking under review, as the nightly reconciliation's
--                               invariant already does (20261105090000): a booking paid after its seats were gone has
--                               no tickets on purpose until resolve_booking_review moves it, and the scan raised a
--                               critical alert for it every five minutes.
--   anomaly_unresolved_reviews  Such a booking left waiting for resolve_booking_review for more than 24 hours raises the
--                               high alert booking_review_unresolved:<booking>, one open alert per booking. Acknowledged
--                               while the booking still waits, it is raised again a day later; it closes by itself once
--                               the review is resolved.
--   run_anomaly_scan            Runs the new rule too.


-- ===== paid_without_tickets =====

-- Replaces the 20261029080200 version: a booking under review is left to that review. Everything else is unchanged.
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
    where b.status = 'paid' and not b.needs_review and b.paid_at < now() - interval '10 minutes'
      and not exists (select 1 from public.tickets_qr t where t.booking_id = b.id)
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


-- ===== booking_review_unresolved =====

-- The wait starts when the review did: the booking event of the late settlement that found no seat, or its paid_at.
-- The title names no booking code, since the alert goes out of band (internal.order_ref).
create function internal.anomaly_unresolved_reviews() returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  waits_too_long constant interval := interval '24 hours';
  batch constant integer := 200;
  hit record;
  raised integer := 0;
begin
  for hit in
    select b.id, b.visit_date, waiting.since
    from public.bookings b
    cross join lateral (select coalesce(max(e.occurred_at), b.paid_at) as since from public.booking_events e
                        where e.booking_id = b.id and e.reason = 'paid_after_expiry_no_quota') as waiting
    where b.status = 'paid' and b.needs_review and b.review_reason = 'PAID_AFTER_EXPIRY_NO_QUOTA'
      and waiting.since < now() - waits_too_long
      and not exists (select 1 from public.security_alerts a
                      where a.fingerprint = 'booking_review_unresolved:' || b.id
                        and a.acknowledged_at > now() - waits_too_long)
    order by waiting.since
    limit batch
  loop
    perform internal.raise_anomaly('booking_review_unresolved', 'high', hit.id::text,
      'Pemesanan lunas tanpa kursi belum diselesaikan lebih dari 24 jam',
      jsonb_build_object('booking_id', hit.id, 'waiting_since', hit.since, 'visit_date', hit.visit_date));
    raised := raised + 1;
  end loop;
  update public.security_alerts a
  set acknowledged_at = now(), details = a.details || jsonb_build_object('closed', 'review_resolved')
  from public.bookings b
  where a.rule = 'booking_review_unresolved' and a.acknowledged_at is null
    and a.fingerprint = 'booking_review_unresolved:' || b.id
    and not (b.status = 'paid' and b.needs_review
             and b.review_reason is not distinct from 'PAID_AFTER_EXPIRY_NO_QUOTA');
  return raised;
end;
$$;
revoke execute on function internal.anomaly_unresolved_reviews() from public, anon, authenticated, service_role;


-- ===== run_anomaly_scan =====

-- Replaces the 20261029080200 version: the unresolved reviews are one more rule. {raised} is unchanged.
create or replace function internal.run_anomaly_scan() returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  since timestamptz := now() - interval '10 minutes';
begin
  return jsonb_build_object('raised',
    internal.anomaly_signature_burst(since) + internal.anomaly_from_events(since) + internal.anomaly_money_and_tickets()
    + internal.anomaly_bookings(since) + internal.anomaly_staff(since) + internal.anomaly_unresolved_reviews());
end;
$$;
