import 'server-only';

import { CERTIFICATE_PROOF_TTL_SECONDS } from '@/config/guest';
import { hasValidSignature, sign } from '@/lib/links/hmac';

// The bk_<booking_code>_certificate_phone cookie (Task P4.5.03; docs/Security.md §6.7, DOC-02): this browser typed the
// last four digits of the PIC's verified number for this booking's certificates.
// `<booking code>.<token_version>.<exp>.<signature>`: the code binds the proof to one booking, so it never opens
// another's, and the version to the booking's links as they stand, so "Cabut tautan" ends the proof with them even
// where the browser kept the cookie (review of PR #94, L2).

const VALUE_PATTERN =
  /^(GSK-[0-9A-HJKMNP-TV-Z]{8})\.([0-9]{1,9})\.([0-9]{1,12})\.([A-Za-z0-9_-]{43})$/;

export interface CertificateProofBinding {
  bookingCode: string;
  tokenVersion: number;
}

export async function signCertificateProof(
  binding: CertificateProofBinding,
  nowSeconds: number,
): Promise<{ value: string; maxAge: number }> {
  const expiry = String(nowSeconds + CERTIFICATE_PROOF_TTL_SECONDS);
  const message = `${binding.bookingCode}.${String(binding.tokenVersion)}.${expiry}`;
  return {
    value: `${message}.${await sign('gsk-certificate-phone-v1', message)}`,
    maxAge: CERTIFICATE_PROOF_TTL_SECONDS,
  };
}

// True for a genuine, unexpired proof made for this booking at its current link version.
export async function isCertificateProof(
  value: string,
  binding: CertificateProofBinding & { nowSeconds: number },
): Promise<boolean> {
  const parts = VALUE_PATTERN.exec(value);
  if (!parts?.[1] || !parts[2] || !parts[3] || !parts[4]) return false;
  if (parts[1] !== binding.bookingCode || Number(parts[2]) !== binding.tokenVersion) return false;
  if (Number(parts[3]) <= binding.nowSeconds) return false;
  return hasValidSignature(
    'gsk-certificate-phone-v1',
    `${parts[1]}.${parts[2]}.${parts[3]}`,
    parts[4],
  );
}
