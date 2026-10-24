import { randomUUID } from 'node:crypto';

import { midtransSignature } from '../src/lib/midtrans/verify-signature';

// A Midtrans payment notification as the sandbox sends one, signed with the given server key (docs/Security.md §3.3
// step 5). pnpm midtrans:simulate posts it to the local webhook; the integration and e2e runs post it too. It lives
// with the scripts, never in src, so nothing the site ships can forge a notification.

export const SIMULATED_STATUSES = [
  'settlement',
  'pending',
  'deny',
  'expire',
  'cancel',
  'refund',
] as const;
export type SimulatedStatus = (typeof SIMULATED_STATUSES)[number];

const STATUS_CODES: Record<SimulatedStatus, string> = {
  settlement: '200',
  pending: '201',
  deny: '202',
  expire: '407',
  cancel: '200',
  refund: '200',
};

export interface SimulatedNotification {
  orderId: string;
  status: SimulatedStatus;
  // As Midtrans writes it, with its two decimals: "1250000.00".
  grossAmount: string;
  transactionId?: string;
  serverKey: string;
  merchantId: string;
}

export function simulatedNotification(input: SimulatedNotification): Record<string, unknown> {
  const signed = {
    order_id: input.orderId,
    status_code: STATUS_CODES[input.status],
    gross_amount: input.grossAmount,
  };
  return {
    transaction_time: '2026-10-24 09:00:00',
    transaction_status: input.status,
    transaction_id: input.transactionId ?? randomUUID(),
    status_message: 'midtrans payment notification',
    ...signed,
    signature_key: midtransSignature(signed, input.serverKey),
    payment_type: 'bank_transfer',
    va_numbers: [{ bank: 'bca', va_number: '12345678901' }],
    merchant_id: input.merchantId,
    fraud_status: 'accept',
    currency: 'IDR',
    ...(input.status === 'settlement' ? { settlement_time: '2026-10-24 09:05:00' } : {}),
  };
}
