# Runbook R2: a ticket exists but no money arrived

Owner: the on-call owner for R1/R2 named at go-live (`docs/Security.md` §13.1 #15), with the Dev on call. Source of truth: `docs/Security.md` §3.6 (REC-03, REC-04, WH-12), §3.8, §11.4 (R2).

This should be impossible: the trigger `tickets_require_paid_booking` refuses a ticket unless its booking is `paid` with a `settled` payment, and a settlement is applied only after the Midtrans Status API confirmed it. So R2 means either a later refund or chargeback (normal), or a broken control (an incident).

Signs: an open `ticket_without_payment` reconciliation issue; Midtrans shows no settlement for a booking with tickets; a chargeback email from Midtrans.

## 1. Stop the ticket working (first 15 minutes)

Until the staff RPC `revoke_ticket` is in the dashboard (Task P4.2), the Dev on call suspends the booking's tickets with the payment path that owns them: a refund or chargeback applied through `internal.apply_payment_event` suspends or revokes them in the same transaction. If that cannot be done at once, tell the RW admins of the affected RWs not to admit the group (the gate shows the booking code on scan) and continue.

```sql
select t.ticket_code, t.status, t.valid_on, t.rw_id, t.issued_at, t.key_id, b.booking_code, b.status as booking_status
from public.tickets_qr t join public.bookings b on b.id = t.booking_id
where b.booking_code = 'GSK-XXXXXXXX';
```

## 2. Is there an innocent explanation?

```sql
select p.order_id, p.status, p.gross_amount, p.refunded_amount, p.settlement_time
from public.payments p join public.bookings b on b.id = p.booking_id
where b.booking_code = 'GSK-XXXXXXXX' order by p.attempt_no;
select received_at, source, transaction_status, processing_result
from public.payment_events where order_id like 'GSK-XXXXXXXX-%' order by received_at;
```

- A `settlement` followed by `refund`, `partial_refund` or `chargeback`: money came and went. Follow `docs/Security.md` §3.8 (the refund's credit note, the ledger reversal); tickets are `revoked` (refund) or `suspended` (chargeback). Not an incident; resolve the reconciliation issue with that note and stop here.
- A settlement in our records that Midtrans does not show: go on.

## 3. Find how the ticket was made

```sql
-- who issued it
select occurred_at, actor_id, actor_role, actor_ip, request_id, action, after
from public.audit_logs where entity_type = 'tickets_qr'
  and entity_id in (select t.id::text from public.tickets_qr t join public.bookings b on b.id = t.booking_id
                    where b.booking_code = 'GSK-XXXXXXXX')
order by occurred_at;
-- is the guard still there and enabled? ('O' = enabled)
select tgname, tgenabled from pg_trigger where tgname = 'tickets_require_paid_booking';
```

Then Supabase → **Logs → Postgres** and the organisation **Audit Logs** (Organization settings) for SQL Editor use in the window, and Vercel **Logs** for the `request_id` of the audit row.

| Finding | Meaning |
|---|---|
| trigger missing or disabled (`tgenabled = 'D'`) | someone with database access removed the control: incident, go on to step 4 |
| actor `service` with a `request_id` from a webhook | an event was applied that Midtrans did not confirm: check whether the Status API answer was faked (impossible unless Midtrans itself showed settlement), suspect the Server Key |
| actor a staff profile | `mark_booking_paid_manually` was used: check its proof file and the approver; possible account takeover (`account-takeover.md`) |

## 4. Contain a broken control

1. Rotate `MIDTRANS_SERVER_KEY` and `SUPABASE_SERVICE_ROLE_KEY` within the hour (`rotate-keys.md`), and sign everyone out of the Supabase dashboard (Organization settings → **Members** → remove anyone unknown; owners change their passwords).
2. Personal data could have been read by the same access: `breach.md`.

## 5. Settle the money

- The visit has not happened: keep the tickets suspended until payment is confirmed (a new payment attempt by the PIC), or cancel the booking.
- The visit already happened: a `write_off` adjustment (`payment_adjustments`, type `write_off`) with the evidence, approved by a second superadmin or after the 24 h delay (dual control).

## 6. Close

1. Restore the trigger with a new migration if it was dropped (never edit the old one), and confirm `supabase/tests/` has a presence test for it.
2. Record in the change log and the audit trail (`incident.closed`, runbook `R2`, the SQL from `r1-money-no-ticket.md` step 5).
3. Rehearse R1 and R2 at the quarterly tabletop (`docs/Security.md` §13.2).
