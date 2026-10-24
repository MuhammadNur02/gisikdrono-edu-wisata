import type { EnumValue } from '@/db/enums';

// The status map of CLAUDE.md §7.2 and docs/PRD.md §9.4, pure and mirrored by internal.midtrans_payment_status in
// 20261024090100_apply_payment_event.sql. Cards are not offered, so a capture is judged by its fraud status alone, and
// one without a verdict waits for a person.

export type PaymentStatus = EnumValue<'payment_status'>;

const STATUS_BY_TRANSACTION: Readonly<Record<string, PaymentStatus>> = {
  settlement: 'settled',
  pending: 'pending',
  deny: 'denied',
  failure: 'failed',
  cancel: 'cancelled',
  expire: 'expired',
  refund: 'refunded',
  partial_refund: 'partially_refunded',
  chargeback: 'disputed',
  partial_chargeback: 'disputed',
};

const CAPTURE_BY_FRAUD_STATUS: Readonly<Record<string, PaymentStatus>> = {
  accept: 'settled',
  deny: 'denied',
};

// Null for a status this site never asks for (a card's authorize), which is stored and ignored.
export function mapMidtransStatus(
  transactionStatus: string,
  fraudStatus: string | undefined,
): PaymentStatus | null {
  if (transactionStatus === 'capture') {
    return CAPTURE_BY_FRAUD_STATUS[fraudStatus ?? ''] ?? 'needs_review';
  }
  return STATUS_BY_TRANSACTION[transactionStatus] ?? null;
}

// docs/Security.md §3.3 step 10: every status is asked of the Status API before it is applied, pending included,
// since a signature covers the order, status code and amount only, and the Virtual Account a pay page shows must be
// Midtrans' own (review of PR #39, L1). A status this site never asks for is stored and ignored without asking.
export function needsStatusConfirmation(status: PaymentStatus | null): boolean {
  return status !== null;
}
