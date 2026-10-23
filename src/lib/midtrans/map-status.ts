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

// docs/Security.md §3.3 step 10: every status that moves money or closes an attempt is asked of the Status API
// before it is applied; only pending, which changes nothing but the instructions shown, is taken as it came.
export function needsStatusConfirmation(status: PaymentStatus | null): boolean {
  return status !== null && status !== 'pending';
}
