import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BRAND_HEX } from '@/config/brand';

const globalsCss = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
const styleGuide = readFileSync(new URL('../../docs/StyleGuide.md', import.meta.url), 'utf8');
const [lightBlock = '', darkBlock = ''] = globalsCss.split('.dark {');

// WCAG 2.1 AA for normal-size text; overlines are 12 px, so the large-text 3:1 never applies.
const AA_TEXT_CONTRAST = 4.5;
const TEXT_SURFACES = ['background', 'card', 'muted'] as const;

function tokenValue(block: string, token: string): string {
  const match = new RegExp(`--${token}:\\s*([^;]+);`).exec(block);
  if (!match?.[1]) throw new Error(`--${token} is missing`);
  return match[1].trim();
}

// "221.2 83.2% 53.3%" -> relative luminance, through sRGB as WCAG defines it.
function luminanceOf(hsl: string): number {
  const [hue = 0, saturation = 0, lightness = 0] = hsl.split(/\s+/).map((part) => parseFloat(part));
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    return l - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const linear = [channel(0), channel(8), channel(4)].map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  const [r = 0, g = 0, b = 0] = linear;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminanceOf(foreground), luminanceOf(background)].sort(
    (a, b) => b - a,
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

describe('--primary-text', () => {
  it.each([
    ['light', lightBlock],
    ['dark', darkBlock],
  ])('passes AA as text on every %s surface', (_mode, block) => {
    for (const surface of TEXT_SURFACES) {
      expect(
        contrast(tokenValue(block, 'primary-text'), tokenValue(block, surface)),
      ).toBeGreaterThan(AA_TEXT_CONTRAST);
    }
  });

  it('is needed because --primary fails as text on the dark background', () => {
    expect(
      contrast(tokenValue(darkBlock, 'primary'), tokenValue(darkBlock, 'background')),
    ).toBeLessThan(AA_TEXT_CONTRAST);
  });

  it('is exposed to Tailwind and copied into docs/StyleGuide.md §2.3', () => {
    expect(globalsCss).toContain('--color-primary-text: hsl(var(--primary-text));');
    for (const block of [lightBlock, darkBlock]) {
      expect(styleGuide).toContain(`--primary-text: ${tokenValue(block, 'primary-text')};`);
    }
  });
});

// The warm home sections and the footer carry body text, muted text, links and RW eyebrows (docs/StyleGuide.md §2.5).
const TEXT_ON_SURFACE_WARM = [
  'surface-warm-foreground',
  'muted-foreground',
  'primary-text',
  'rw-leaf',
  'rw-terracotta',
  'rw-mulberry',
] as const;

describe('--surface-warm', () => {
  it.each([
    ['light', lightBlock],
    ['dark', darkBlock],
  ])('keeps every text colour used on it at AA in %s mode', (_mode, block) => {
    for (const text of TEXT_ON_SURFACE_WARM) {
      expect(
        contrast(tokenValue(block, text), tokenValue(block, 'surface-warm')),
      ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
    }
  });

  it('is exposed to Tailwind and copied into docs/StyleGuide.md §2.3', () => {
    expect(globalsCss).toContain('--color-surface-warm: hsl(var(--surface-warm));');
    for (const block of [lightBlock, darkBlock]) {
      expect(styleGuide).toContain(`--surface-warm: ${tokenValue(block, 'surface-warm')};`);
    }
  });
});

// "222.2 47.4% 11.2%" -> "#0F172A", rounding each channel as browsers do.
function hexOf(hsl: string): string {
  const [hue = 0, saturation = 0, lightness = 0] = hsl.split(/\s+/).map((part) => parseFloat(part));
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = l - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}

describe('BRAND_HEX', () => {
  it('matches the light tokens the OG images and the manifest stand in for', () => {
    expect(hexOf(tokenValue(lightBlock, 'brand-deep'))).toBe(BRAND_HEX.deep);
    expect(hexOf(tokenValue(lightBlock, 'brand-ice'))).toBe(BRAND_HEX.ice);
    expect(hexOf(tokenValue(lightBlock, 'background'))).toBe(BRAND_HEX.background);
  });
});
