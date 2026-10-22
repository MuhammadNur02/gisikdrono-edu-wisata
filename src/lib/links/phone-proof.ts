import 'server-only';

import { z } from 'zod';

import { PHONE_PROOF_TTL_SECONDS } from '@/config/guest';
import { hasValidSignature, sign } from '@/lib/links/hmac';

// The gsk_phone cookie (Task P3.2.03, docs/Security.md §4.1, GUEST-08): this browser entered the code sent to the
// PIC. channel says what the code proved: the WhatsApp number, or, while WhatsApp was unavailable, the email address,
// in which case the phone is only what the visitor typed and must not count as verified. The proof names the browser
// by the hash of its gsk_otp_browser id, the one the code was issued to, and is read only beside that cookie (review
// of PR #27, L8).

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
    b: z.string(),
  })
  .strict();

// Room for the longest address an email field takes (254 characters) beside the browser's hash.
const PROOF_PATTERN = /^([A-Za-z0-9_-]{16,800})\.([A-Za-z0-9_-]{43})$/;

// browserHash is otpBrowserHash of the gsk_otp_browser id (src/lib/otp.ts), handed in by guest-cookies.ts.
interface ProofBinding {
  browserHash: string;
  nowSeconds: number;
}

export async function signPhoneProof(
  proof: Omit<PhoneProof, 'expiresAt'>,
  binding: ProofBinding,
): Promise<{ value: string; maxAge: number }> {
  const payload = Buffer.from(
    JSON.stringify({
      c: proof.channel,
      p: proof.phone,
      e: proof.email,
      o: proof.otpId,
      exp: binding.nowSeconds + PHONE_PROOF_TTL_SECONDS,
      b: binding.browserHash,
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
  binding: ProofBinding,
): Promise<PhoneProof | null> {
  const parts = PROOF_PATTERN.exec(value);
  if (!parts?.[1] || !parts[2]) return null;
  if (!(await hasValidSignature('gsk-phone-proof-v1', parts[1], parts[2]))) return null;
  const proof = decodeProof(parts[1]);
  if (!proof || proof.exp <= binding.nowSeconds || proof.b !== binding.browserHash) return null;
  return { channel: proof.c, phone: proof.p, email: proof.e, otpId: proof.o, expiresAt: proof.exp };
}
