-- The reconciliation issue types of both the Midtrans statement import (20261104210200, unknown_order) and the manual
-- bank transfer (20261104220300, manual_transfer_unmatched). Each of those migrations replaced the check with its own
-- list, and 20261104220300 runs after 20261104210200, so without this the statement import could no longer record an
-- unknown order.
alter table public.reconciliation_issues drop constraint reconciliation_issues_issue_type_check;
alter table public.reconciliation_issues add constraint reconciliation_issues_issue_type_check
  check (issue_type in ('paid_without_tickets', 'ticket_without_payment', 'amount_mismatch', 'status_disagreement',
                        'pending_beyond_ttl', 'ledger_sum_mismatch', 'chain_broken', 'payout_mismatch',
                        'duplicate_settlement', 'unknown_order', 'manual_transfer_unmatched'));
