import { createHash, timingSafeEqual } from 'node:crypto';

// docs/Security.md §3.3 step 5 (WH-01): a notification is Midtrans' own when its signature_key is
// sha512(order_id + status_code + gross_amount + server key), over the strings exactly as they arrived ("1250000.00",
// never a parsed number). During a key rotation the previous key is tried too (§3.9).

export interface SignedFields {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
}

export function midtransSignature(
  fields: Omit<SignedFields, 'signature_key'>,
  serverKey: string,
): string {
  return createHash('sha512')
    .update(fields.order_id + fields.status_code + fields.gross_amount + serverKey)
    .digest('hex');
}

// Compared in constant time, so the answer gives a forger no hint of how close they came.
export function hasValidMidtransSignature(
  fields: SignedFields,
  serverKeys: readonly string[],
): boolean {
  const received = Buffer.from(fields.signature_key, 'utf8');
  return serverKeys.some((serverKey) => {
    const expected = Buffer.from(midtransSignature(fields, serverKey), 'utf8');
    return expected.length === received.length && timingSafeEqual(expected, received);
  });
}
