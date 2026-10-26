# Runbook: our records and Midtrans disagree

Owner: superadmin (finance) with the Dev on call. Source of truth: `docs/Security.md` §3.7, §3.8 (REC-01…REC-11), §11.4. A missing ticket after payment is `r1-money-no-ticket.md`; a ticket without payment is `r2-ticket-no-money.md`.

Signs: an open `reconciliation_issues` row, a `status_disagreement` or `webhook_amount_mismatch` security event, a treasurer who says the payout does not match, a booking stuck in `pending_payment` that the PIC says is paid.

**Never** edit `payments`, `bookings`, `tickets_qr` or `revenue_share_entries` by hand: triggers refuse most of it, and the rest would break the ledger chain. Every correction is a sync, an adjustment or an acknowledgement.

## 1. Collect both sides

1. Reconciliation: the nightly job (`reconcile-payments`, 02:30 WIB, Task P3.9.03) writes `reconciliation_runs` and `reconciliation_issues`. Open issues:

   ```sql
   select i.created_at, i.issue_type, i.severity, i.details, b.booking_code
   from public.reconciliation_issues i left join public.bookings b on b.id = i.booking_id
   where i.resolved_at is null order by i.severity desc, i.created_at;
   ```

   Until the job ships, compare by hand with the query in step 2.
2. Our side for one order (`<order_id>` = `GSK-XXXXXXXX-NN`):

   ```sql
   select p.order_id, p.status, p.gross_amount, p.refunded_amount, p.settlement_time, b.status as booking_status, b.total_amount
   from public.payments p join public.bookings b on b.id = p.booking_id where p.order_id = '<order_id>';
   select received_at, source, transaction_status, status_code, gross_amount_raw, processing_result
   from public.payment_events where order_id = '<order_id>' order by received_at;
   ```

3. Midtrans' side: Midtrans dashboard → **Transactions** → search the order id; or `pnpm midtrans:status -- --order <order_id> --file <env file of that environment>` (prints status, fraud status and amount, never a key). For a period: **Transactions → Download** the CSV for the dates in question.

## 2. Resolve by type

| What you see | Meaning | Do |
|---|---|---|
| Midtrans `settlement`, ours `pending` or `initiated` | the notification never arrived or was refused | Check `webhook_rejections` for the order and the Notification URL in Midtrans (**Settings → Payment → Notification URL**). The `payments-poll` job (every 5 min, Task P3.9.02) applies the Status API answer; until it ships, the Dev on call re-applies through `payment-service` against the Status API. Then `r1-money-no-ticket.md` if tickets are missing |
| ours `settled`, Midtrans not settled | forged or mis-applied event | Stop: `r2-ticket-no-money.md` |
| amounts differ (`webhook_amount_mismatch`, payment `needs_review`) | the visitor paid another amount | Midtrans' amount is what was paid. Underpaid: refund in Midtrans and ask the PIC to book again. Our bug: a `payment_adjustments` proposal with the Midtrans screenshot as evidence, approved by a second superadmin (or after the 24 h delay), then fix the bug |
| two settlements for one booking (`duplicate`) | paid twice | Refund the second order in Midtrans (**Transactions → the order → Refund**), then record it with `record_refund` from the booking's page (Task P4.7.03) |
| `pending_beyond_ttl` | a payment still pending after its hold | Expire it at Midtrans if still open (`/v2/<order_id>/expire` through the next payment attempt, or the dashboard); our side follows the notification |
| `ledger_sum_mismatch`, `chain_broken` | the ledger or audit chain does not add up | Do not continue: page the Dev on call; this is a possible tampering case (`breach.md`, preserve step) |
| `refund_paid_twice_detected` (high) | a visit-terms refund was paid twice: the treasurer's bank transfer went out, then Midtrans carried out the QRIS refund it had refused or not answered, and the transfer's `manual_refund` adjustment was rejected when it would apply (`docs/Security.md` §3.8) | The ledger and the payment already show one refund. 1. Confirm both at Midtrans (**Transactions → the order → Refunds**, the request's `refund_key`) and in the bank statement. 2. Contact the PIC by the booking's WhatsApp, say the refund arrived twice, and ask for the duplicate back to the kelurahan account the transfer came from. 3. When it returns, record it with the bank statement as evidence in the alert's acknowledgement note and, for the treasury, in the finance notes of the booking (Task P4.7); nothing is booked in the ledger, which never counted the transfer. 4. If the visitor does not return it within 14 days, the superadmin decides with the kelurahan whether to write it off (a `write_off` adjustment) and says so in the acknowledgement |
| `payout_mismatch` | the payout went to another account than expected | Midtrans → **Settings → Bank account**; compare with `/dashboard/settings` → the masked payout account (`finance.expected_payout_account_masked`). A different account is an incident: owner changes the password and 2FA, `key-leak.md` for the Server Key |

## 3. Close the issue

Once the cause is fixed, mark the issue resolved with a reason (never delete it). Until `/dashboard/finance/reconciliation` exists (Task P4.7), the Dev on call records it in the SQL Editor:

```sql
update public.reconciliation_issues
set resolved_at = now(), resolved_by = '<your profile id>', resolution_note = '<what was done, with the Midtrans reference>'
where id = '<issue id>';
```

Monthly (`docs/Security.md` §13.2): compare the payout report with `v_revenue_recap_daily` and check the payout account.
