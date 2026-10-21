import 'server-only';

import { z } from 'zod';

import { PHONE_PROOF_TTL_SECONDS } from '@/config/guest';
import { hasValidSignature, sign } from '@/lib/links/hmac';

// The gsk_phone cookie (Task P3.2.03, docs/Security.md §4.1, GUEST-08): this browser entered the code sent to the
// PIC. channel says what the code proved: the WhatsApp number, or, while WhatsApp was unavailable, the email address,
// in which case the phone is only what the visitor typed and must not count as verified.

export interface PhoneProof {
  channel: 'whatsapp' | 'email';
  phone: string;
  email: string | null;
  otpId: string;
  expiresAt: number;
}

const proofSchema = z
  .object({
    c: z.enum(['whatsapp', 'email']),
    p: z.string(),
    e: z.string().nullable(),
    o: z.uuid(),
    exp: z.int().positive(),
  })
  .strict();

const PROOF_PATTERN = /^([A-Za-z0-9_-]{16,400})\.([A-Za-z0-9_-]{43})$/;

export async function signPhoneProof(
  proof: Omit<PhoneProof, 'expiresAt'>,
  nowSeconds: number,
): Promise<{ value: string; maxAge: number }> {
  const payload = Buffer.from(
    JSON.stringify({
      c: proof.channel,
      p: proof.phone,
      e: proof.email,
      o: proof.otpId,
      exp: nowSeconds + PHONE_PROOF_TTL_SECONDS,
    }),
  ).toString('base64url');
  return {
    value: `${payload}.${await sign('gsk-phone-proof-v1', payload)}`,
    maxAge: PHONE_PROOF_TTL_SECONDS,
  };
}

function decodeProof(payload: string): z.infer<typeof proofSchema> | null {
  try {
    const parsed = proofSchema.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function readPhoneProof(
  value: string,
  nowSeconds: number,
): Promise<PhoneProof | null> {
  const parts = PROOF_PATTERN.exec(value);
  if (!parts?.[1] || !parts[2]) return null;
  if (!(await hasValidSignature('gsk-phone-proof-v1', parts[1], parts[2]))) return null;
  const proof = decodeProof(parts[1]);
  if (!proof || proof.exp <= nowSeconds) return null;
  return { channel: proof.c, phone: proof.p, email: proof.e, otpId: proof.o, expiresAt: proof.exp };
}
