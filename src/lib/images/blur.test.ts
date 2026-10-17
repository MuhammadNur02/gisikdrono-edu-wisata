import { encode } from 'blurhash';
import { describe, expect, it } from 'vitest';

import { blurhashToColour } from '@/lib/images/blur';

// A 4 × 3 hash of a flat colour, encoded the way the upload pipeline does it.
function flatColourHash(red: number, green: number, blue: number): string {
  const pixels = new Uint8ClampedArray(
    Array.from({ length: 8 * 6 }, () => [red, green, blue, 255]).flat(),
  );
  return encode(pixels, 8, 6, 4, 3);
}

describe('blurhashToColour', () => {
  it('reads the average colour a hash carries', () => {
    expect(blurhashToColour(flatColourHash(40, 120, 60))).toBe('#28783c');
    expect(blurhashToColour(flatColourHash(255, 255, 255))).toBe('#ffffff');
  });

  it('pads dark colours to six hex digits', () => {
    expect(blurhashToColour(flatColourHash(0, 0, 9))).toBe('#000009');
  });

  it('reads a real photo hash', () => {
    expect(blurhashToColour('LEHV6nWB2yk8pyo0adR*.7kCMdnj')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('gives no colour for a missing or broken hash', () => {
    expect(blurhashToColour(null)).toBeNull();
    expect(blurhashToColour('')).toBeNull();
    expect(blurhashToColour('not-a-blurhash')).toBeNull();
  });
});
