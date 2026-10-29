# Runbook R1: the visitor paid but has no ticket

Owner: the on-call owner for R1/R2 named at go-live (`docs/Security.md` §13.1 #15), with the Dev on call. Source of truth: `docs/Security.md` §3.5–§3.7, §11.4 (R1). Target: tickets out within 1 hour of the report; a group at the gate today goes first (step 7).

Signs: a PIC sends a Midtrans receipt but `/reservasi/<code>` still asks for payment; an open `paid_without_tickets` reconciliation issue or anomaly alert; an `admin_booking_needs_review` notification.

`paid_without_tickets` (the anomaly scan and the nightly reconciliation) leaves out only a booking under review for `PAID_AFTER_EXPIRY_NO_QUOTA`: it was paid after its seats were gone, so it has no tickets on purpose until the superadmin resolves it, and it raises `booking_review_unresolved` after 24 hours instead (20261105130300). Every other paid booking without tickets raises it, one under review included, for example `REVENUE_RULE_REFUSED`, whose tickets the payments poll keeps retrying.

## 1. Identify the order

Ask for the booking code (`GSK-XXXXXXXX`) or the Midtrans order id (`GSK-XXXXXXXX-NN`, on the receipt). Then, in Supabase **SQL Editor** of production:

```sql
select b.booking_code, b.status as booking_status, b.expires_at, p.order_id, p.status as payment_status,
       p.gross_amount, p.settlement_time,
       (select count(*) from public.tickets_qr t where t.booking_id = b.id) as tickets
from public.bookings b left join public.payments p on p.booking_id = b.id
where b.booking_code = 'GSK-XXXXXXXX' order by p.attempt_no;
```

## 2. What did we receive?

```sql
select received_at, source, transaction_status, status_code, gross_amount_raw, processing_result
from public.payment_events where order_id = '<order_id>' order by received_at;
select received_at, reason, status_code from public.webhook_rejections where order_id = '<order_id>' order by received_at;
```

And what Midtrans holds: `pnpm midtrans:status -- --order <order_id> --file <production env file>` or Midtrans dashboard → **Transactions** → the order.

## 3. Follow the first row that matches

| Finding | Cause | Do |
|---|---|---|
| No `payment_events` and no `webhook_rejections` | Midtrans never reached us | Midtrans → **Settings → Payment → Notification URL** must be `https://<domain>/api/webhooks/midtrans/<path token>`; Vercel **Logs** filtered on `/api/webhooks/midtrans` show 404s when the path token is wrong. Fix the URL, then let `payments-poll` (every 5 min, Task P3.9.02) apply the Status API answer; until it ships, the Dev on call applies it through `payment-service` ("Sinkronkan dengan Midtrans" in the booking page once Task P4.2 ships) |
| `webhook_rejections` with `signature_invalid` | the Server Key in Vercel is not the one Midtrans signs with (or sandbox vs production) | Run `pnpm midtrans:check` with the environment's keys (`docs/Security.md` §3.9; a key prefix cannot tell sandbox from production). Fix the variable in Vercel, redeploy, then sync as above |
| `webhook_rejections` with `merchant_mismatch` | wrong `MIDTRANS_MERCHANT_ID` | same as above |
| `processing_result` mentions an amount mismatch, payment `needs_review` | paid amount differs from the booking | Midtrans' amount is what was paid. Never edit rows. Underpaid: refund and ask the PIC to book again. Our bug: `payment_adjustments` with evidence and dual control (`payment-discrepancy.md`), then fix the bug |
| booking `paid`, `tickets = 0` | tickets failed after payment | "Terbitkan ulang tiket" (`ensureTicketsIssued`, Task P3.10.04) re-runs the issue inside `apply_payment_event`; then retry failed notifications (below) |
| payment `needs_review`, booking expired before settlement and the session is full | late settlement, no seat | Call the PIC. Either move them to another session and `resolve_booking_review('issue_tickets')`, or `resolve_booking_review('refund')` and refund in Midtrans |
| tickets exist, the PIC did not get them | delivery failed | `select template, channel, status, attempts, last_error, dead_at from public.notifications where booking_id = (select id from public.bookings where booking_code = 'GSK-XXXXXXXX') order by created_at;` then `request_notification_resend` from the booking page, or send the PIC the link through `/reservasi/cari` |

## 4. Group at the gate right now

If the payment is confirmed at Midtrans (step 2) but tickets cannot be issued in time, an `admin_rw` of that RW checks the group in by **manual check-in** (booking code + last 4 digits of the verified phone, today only), and only if `bookings.status = 'paid'`. If the booking is not `paid` in our database, the group waits or the superadmin decides; never mark it paid by hand outside `mark_booking_paid_manually` with proof.

## 5. Close

1. Resolve the reconciliation issue with a note (`payment-discrepancy.md`, step 3).
2. Record the incident in the audit trail (an audit row must name its actor, so give your own profile id):

   ```sql
   begin;
   select set_config('app.actor_id', '<your profile id>', true);
   select internal.log_audit('incident.closed', 'bookings',
          (select id::text from public.bookings where booking_code = 'GSK-XXXXXXXX'),
          jsonb_build_object('runbook', 'R1', 'cause', '<one line>'));
   commit;
   ```

3. A bug was the cause: add the failing case as a test before the fix (CLAUDE.md §9.1).
