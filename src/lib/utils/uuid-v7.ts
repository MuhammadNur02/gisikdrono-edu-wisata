// A UUID version 7 (RFC 9562) starts with the Unix time in milliseconds, so the name of a quarantine upload
// also says when api/uploads/sign issued it, and finalize can tell a file that came in too late
// (docs/Security.md §8.4) without a table to remember every signature. Web Crypto keeps this module usable in
// the browser too, where the editor checks public-media paths with the same rules.

const UUID_BYTES = 16;
// 2^32: the timestamp is written as its top 16 bits and its low 32.
const TIMESTAMP_HIGH_FACTOR = 4_294_967_296;
const TIMESTAMP_LOW_OFFSET = 2;
const TIMESTAMP_HEX_LENGTH = 12;
const VERSION_BYTE = 6;
const VARIANT_BYTE = 8;
const LOW_NIBBLE = 0x0f;
const VERSION_7 = 0x70;
const VARIANT_MASK = 0x3f;
const VARIANT_RFC = 0x80;
const HEX = 16;
const HEX_DIGITS_PER_BYTE = 2;
// The 32 hex digits in the 8-4-4-4-12 groups of the written form.
const UUID_GROUPS = /^(.{8})(.{4})(.{4})(.{4})(.{12})$/;

export const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function createUuidV7(nowMs: number = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(UUID_BYTES));
  const view = new DataView(bytes.buffer);
  view.setUint16(0, Math.floor(nowMs / TIMESTAMP_HIGH_FACTOR));
  view.setUint32(TIMESTAMP_LOW_OFFSET, nowMs % TIMESTAMP_HIGH_FACTOR);
  view.setUint8(VERSION_BYTE, (view.getUint8(VERSION_BYTE) & LOW_NIBBLE) | VERSION_7);
  view.setUint8(VARIANT_BYTE, (view.getUint8(VARIANT_BYTE) & VARIANT_MASK) | VARIANT_RFC);
  const hex = Array.from(bytes, (byte) => byte.toString(HEX).padStart(HEX_DIGITS_PER_BYTE, '0'));
  return hex.join('').replace(UUID_GROUPS, '$1-$2-$3-$4-$5');
}

// The millisecond timestamp a UUID v7 was created at, or null for anything else.
export function uuidV7Time(uuid: string): number | null {
  if (!UUID_V7_PATTERN.test(uuid)) return null;
  return Number.parseInt(uuid.replaceAll('-', '').slice(0, TIMESTAMP_HEX_LENGTH), HEX);
}
