import { createHmac } from 'node:crypto';

// The local development staff accounts that pnpm db:seed writes (README.md "Local development accounts").
// DEV-ONLY: they exist only on a developer's database and in CI, because pnpm db:seed reaches the local stack on
// 127.0.0.1 alone and its SQL refuses any database not marked local. These constants are the only copy of the
// password and the TOTP secret; scripts/seed-dev.sql reads them from the transaction that seed-dev.ts opens.
export const DEV_ONLY_PASSWORD = 'DEV-ONLY-local-Password-1!';
export const DEV_ONLY_TOTP_SECRET = 'DEVONLYLOCALTOTPGISIKDRONOSECRET';

export const DEV_ACCOUNTS = [
  { email: 'superadmin@dev.gisikdrono.test', role: 'superadmin', rwId: null },
  { email: 'admin-rw05@dev.gisikdrono.test', role: 'admin_rw', rwId: 5 },
  { email: 'admin-rw13@dev.gisikdrono.test', role: 'admin_rw', rwId: 13 },
  { email: 'admin-rw08@dev.gisikdrono.test', role: 'admin_rw', rwId: 8 },
  // The Koperasi Merah Putih's UMKM admin (docs/PRD.md §13.1 A30), for no RW.
  { email: 'admin-kopdes@dev.gisikdrono.test', role: 'admin_kopdes', rwId: null },
] as const;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BITS_PER_BASE32_CHAR = 5;
const BITS_PER_BYTE = 8;
const BINARY_RADIX = 2;
const COUNTER_BYTES = 8;
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const MS_PER_SECOND = 1000;
const DECIMAL_BASE = 10;
// RFC 4226 dynamic truncation: the low nibble of the last byte picks the offset, and the top bit is dropped.
const OFFSET_NIBBLE_MASK = 0x0f;
const DROP_SIGN_BIT_MASK = 0x7fffffff;

function base32ToBytes(secret: string): Buffer {
  let bits = '';
  for (const char of secret.replace(/=+$/, '').toUpperCase()) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value < 0) throw new Error(`not a base32 character: ${char}`);
    bits += value.toString(BINARY_RADIX).padStart(BITS_PER_BASE32_CHAR, '0');
  }
  const bytes = [];
  for (let start = 0; start + BITS_PER_BYTE <= bits.length; start += BITS_PER_BYTE) {
    bytes.push(Number.parseInt(bits.slice(start, start + BITS_PER_BYTE), BINARY_RADIX));
  }
  return Buffer.from(bytes);
}

// RFC 6238 with SHA-1, 30-second steps and six digits, the TOTP that Supabase Auth verifies.
export function totpCode(base32Secret: string, at: Date = new Date()): string {
  const counter = Buffer.alloc(COUNTER_BYTES);
  counter.writeBigUInt64BE(BigInt(Math.floor(at.getTime() / MS_PER_SECOND / TOTP_STEP_SECONDS)));
  const digest = createHmac('sha1', base32ToBytes(base32Secret)).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & OFFSET_NIBBLE_MASK;
  const code = (digest.readUInt32BE(offset) & DROP_SIGN_BIT_MASK) % DECIMAL_BASE ** TOTP_DIGITS;
  return code.toString().padStart(TOTP_DIGITS, '0');
}
