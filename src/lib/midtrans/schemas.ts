import { z } from 'zod';

// The shapes Midtrans sends and answers (Task P3.7.01, P3.8.01). Every other key passes through as it came: the
// signature covers the raw strings, and the database keeps only the keys reconciliation reads
// (midtrans_payload_minimise, docs/Security.md §7.2).

const SHA512_HEX = /^[0-9a-f]{128}$/;
const STATUS_CODE = /^\d{3}$/;
const SHORT_TEXT_MAX_LENGTH = 64;

const shortText = z.string().min(1).max(SHORT_TEXT_MAX_LENGTH);

// docs/Security.md §3.3 step 4: the fields a notification must carry before its signature is checked.
export const midtransNotificationSchema = z.looseObject({
  order_id: shortText,
  status_code: z.string().regex(STATUS_CODE),
  gross_amount: shortText,
  signature_key: z.string().regex(SHA512_HEX),
  transaction_status: shortText,
  transaction_id: shortText,
  payment_type: shortText,
  currency: shortText,
  fraud_status: shortText.optional(),
  merchant_id: shortText.optional(),
});

export type MidtransNotification = z.infer<typeof midtransNotificationSchema>;

// The Status API answers with its own code in the body ("404" for an order it never charged), so only that code is
// required; apply_payment_event compares the rest with the notification and the payment.
export const midtransStatusSchema = z.looseObject({
  status_code: z.string().regex(STATUS_CODE),
  status_message: z.string().optional(),
  order_id: z.string().optional(),
  transaction_status: z.string().optional(),
  fraud_status: z.string().optional(),
  gross_amount: z.string().optional(),
  currency: z.string().optional(),
});

export type MidtransStatus = z.infer<typeof midtransStatusSchema>;

// POST /snap/v1/transactions answers 201 with the page's token and address.
export const snapTransactionSchema = z.object({
  token: z.string().min(1),
  redirect_url: z.url({ protocol: /^https?$/ }),
});
