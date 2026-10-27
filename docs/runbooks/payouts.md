# Runbook: the Midtrans statement and the monthly payout check

Owner: superadmin (finance), with the kelurahan treasurer reading along. Source of truth: `docs/Security.md` §3.7 (REC-02), §3.8, §13.2; Task P4.7.05. A difference found here is worked through with `payment-discrepancy.md`; a payout to an unexpected account is an incident (`key-leak.md`, `breach.md`).

Two routines keep Midtrans, the bank account and our ledger telling the same story:

- **Weekly**, the transaction statement: every order Midtrans knows is compared with the payment we hold for it. It catches money taken outside the app (an order id we never issued), and amounts or statuses that drifted apart.
- **Monthly**, the payout check: what Midtrans transferred to the kelurahan's account against what our ledger says was settled, then the payouts to the RW treasuries and UMKM vendors recorded with proof.

**Never** edit `payments`, `bookings`, `revenue_share_entries` or `payout_batches` by hand. The import only records findings; every correction is a sync (`Cek status Midtrans`), a recorded refund, an adjustment or a closed finding with a reason.

## 1. Weekly: import the transaction statement

1. Midtrans dashboard (production merchant, the finance read-only sub-account is enough) → **Transactions** → filter the last 7 days plus a margin of 2 days → **Download** as CSV. Keep the file as it is; do not open and re-save it in a spreadsheet, which may rewrite the amounts.
2. `/dashboard/finance/reconciliation` → **Impor laporan transaksi Midtrans** → choose the file. The page reads it in the browser and says how many transactions it found, or which rows it cannot read (the row numbers are the spreadsheet's). It needs the columns *Order ID*, *Transaction Status* (or *Status*) and *Gross Amount* (or *Amount*), comma or semicolon separated, at most 5 000 transactions and whole-rupiah amounts.
3. Type the authenticator code and confirm. The import is a reconciliation run of its own (`reconciliation_runs.source = 'csv_import'`, the file name in its summary) and is in the audit log as `reconciliation.csv_import`.
4. Work through the new findings on the same page:

| Finding | Meaning | Do |
|---|---|---|
| `unknown_order` | Midtrans lists an order id no payment of ours holds | An id in our grammar (`GSK-XXXXXXXX-NN`) but unknown: check `webhook_rejections` and `payment_events` for it, then `payment-discrepancy.md`. Any other id: money taken through the merchant outside the app (a payment link, a test order on production). Ask the Midtrans owner account who created it; treat an unexplained one as an incident |
| `amount_mismatch` (high) | Midtrans' gross amount differs from the payment's | `payment-discrepancy.md`, "amounts differ" |
| `status_disagreement`, high | Money is on one side only: Midtrans says settled, refunded or disputed and we do not, or we hold a settled, refunded, disputed or duplicate payment Midtrans describes otherwise | Open the booking, **Cek status Midtrans**; the Status API answer is applied as the poll would. A refund Midtrans shows is then recorded with `record_refund`. Ours settled while Midtrans says otherwise: stop, `r2-ticket-no-money.md` |
| `status_disagreement`, medium | Neither side holds money: for instance Midtrans says expired while we still say pending | Usually a notification still on its way: run **Cek status Midtrans** once; close the finding as *ignored* with the reason when the statuses agree afterwards |

A statement row that agrees raises nothing. A capture in the statement counts as settled, since the export carries no fraud status and this merchant offers no cards. Close every finding with what was done and the Midtrans reference; a finding is never deleted.

## 2. Monthly: Midtrans payout against the ledger

Do this in the first week of the month for the month before, in Jakarta days.

1. **Midtrans' side.** Midtrans dashboard → the payout (settlement transfer) report of the month: the total transferred, the fees, the refunds and the destination bank account.
2. **Our side.** `/dashboard/finance`, period = the month: gross settled, refunds and net, by method. The invariant line must read as holding; if it does not, stop and page the Dev on call.
3. **Compare.** Midtrans' gross for the month must equal our gross settled, and its refunds ours. The transferred total is then our net minus the Midtrans fees of the merchant agreement (a percentage for QRIS, a flat fee per Virtual Account payment). A payment settled in the last hours of a month can fall into the next payout; note it and check it next month.
4. **Any other difference:** import the month's transaction statement (section 1) and work through its findings before going on.
5. **The account.** The destination account on the payout report must end in the four digits of `/dashboard/settings` → *finance.expected_payout_account_masked*. Another account is an incident: the owner account changes its password and 2FA at once, the Server Key is rotated (`rotate-keys.md`), and the case is recorded as a `payout_mismatch` finding.

## 3. Monthly: pay the RW treasuries and vendors

Only after Midtrans' transfer for those settlements is in the kelurahan's account.

1. `/dashboard/finance/revenue-share` → the balances per party: accrued, paid out, outstanding (from `v_revenue_recap_by_party`).
2. Transfer each outstanding amount from the kelurahan's account to the RW treasury or vendor account on file.
3. Record each transfer as a payout batch: the party, the bank reference (3 to 100 characters), the last four digits of the account paid and the transfer proof (PDF or image). The batch stamps the ledger rows it pays once; the same proof cannot back a second batch.
4. A transfer that went wrong is not undone in the ledger: record what was actually paid, and propose an adjustment with evidence for the correction (`docs/Security.md` §3.8).

## 4. Record and sign off

Write in the monthly finance note, kept by the kelurahan office:

- the month, the Midtrans payout reference and its totals, and our gross, refunds and net;
- the difference and how the fees explain it; any payment carried into the next month;
- the findings raised and closed (counts and the open ones by id), with the date of the last weekly import;
- the payout batches recorded, per party, with their references.

The Lurah's office signs the note. The imports, closed findings and payout batches are already in the audit log; the note is what a reader outside the system checks against.
