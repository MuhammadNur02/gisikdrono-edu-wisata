// iPhone photos are HEIF files: an ISO-BMFF `ftyp` box whose brand says HEIC (`ftypheic`, `ftypmif1`, …).
// sharp's prebuilt libvips cannot decode them, so they are recognised by their bytes, never by the name or the
// type the browser reports, and refused with a message that says how to get a JPG instead. AVIF uses the same
// box with its own brand and is not a HEIC photo; it falls under the ordinary unsupported-format message.
// Only the first 64 bytes are read, whatever size the box claims (security review of PR #14, L1): an iPhone's
// ftyp box fits well within them, and a forged size can no longer make finalize walk a whole file.

import { LEADING_BYTES_LENGTH } from '@/config/uploads';

const FTYP_OFFSET = 4;
const MAJOR_BRAND_OFFSET = 8;
const COMPATIBLE_BRANDS_OFFSET = 16;
const BRAND_LENGTH = 4;
const BOX_SIZE_BASE = 256;

const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'hevx',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);
const AVIF_BRANDS = new Set(['avif', 'avis']);

function asciiAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + BRAND_LENGTH));
}

function boxSize(bytes: Uint8Array): number {
  return bytes.subarray(0, FTYP_OFFSET).reduce((size, byte) => size * BOX_SIZE_BASE + byte, 0);
}

function compatibleBrands(bytes: Uint8Array): string[] {
  const end = Math.min(boxSize(bytes), bytes.length, LEADING_BYTES_LENGTH);
  const brands: string[] = [];
  for (
    let offset = COMPATIBLE_BRANDS_OFFSET;
    offset + BRAND_LENGTH <= end;
    offset += BRAND_LENGTH
  ) {
    brands.push(asciiAt(bytes, offset));
  }
  return brands;
}

export function isHeifSignature(bytes: Uint8Array): boolean {
  const hasFtypBox =
    bytes.length >= COMPATIBLE_BRANDS_OFFSET && asciiAt(bytes, FTYP_OFFSET) === 'ftyp';
  if (!hasFtypBox || !HEIF_BRANDS.has(asciiAt(bytes, MAJOR_BRAND_OFFSET))) return false;
  return !compatibleBrands(bytes).some((brand) => AVIF_BRANDS.has(brand));
}
