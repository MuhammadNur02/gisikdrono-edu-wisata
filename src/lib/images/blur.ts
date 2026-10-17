import 'server-only';

import { isBlurhashValid } from 'blurhash';

// The upload pipeline stores a short blurhash per image, and the photo slot shows its average colour while the
// photo loads. A blurred picture would need a data: URL, which the CSP's img-src does not allow
// (docs/Security.md §8.2), so the slot gets a plain background colour instead (decision of 2026-10-18).

const BASE83_DIGITS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
// Characters 2 to 5 of a blurhash hold its DC component: the average colour as one 24-bit sRGB number.
const AVERAGE_COLOUR_START = 2;
const AVERAGE_COLOUR_END = 6;
const HEX_COLOUR_DIGITS = 6;
const HEX_RADIX = 16;

// isBlurhashValid has already checked every character is a base83 digit.
function decodeBase83(text: string): number {
  let value = 0;
  for (const digit of text) value = value * BASE83_DIGITS.length + BASE83_DIGITS.indexOf(digit);
  return value;
}

// `#rrggbb`, or null for a missing or broken hash, in which case the slot keeps its muted background.
export function blurhashToColour(blurhash: string | null): string | null {
  if (!blurhash || !isBlurhashValid(blurhash).result) return null;
  const rgb = decodeBase83(blurhash.slice(AVERAGE_COLOUR_START, AVERAGE_COLOUR_END));
  return `#${rgb.toString(HEX_RADIX).padStart(HEX_COLOUR_DIGITS, '0')}`;
}
