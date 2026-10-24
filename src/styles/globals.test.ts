import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BRAND_HEX } from '@/config/brand';
import { DB_ENUMS } from '@/db/enums';

const globalsCss = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
const utilitiesCss = readFileSync(new URL('./utilities.css', import.meta.url), 'utf8');
const styleGuide = readFileSync(new URL('../../docs/StyleGuide.md', import.meta.url), 'utf8');

// The three custom-property blocks of globals.css: the light values, the dark overrides, and the aliases that point
// at them (palette keys, the current RW, the header).
function blockAfter(marker: string, from = 0): string {
  const start = globalsCss.indexOf(marker, from);
  if (start < 0) throw new Error(`${marker} is missing`);
  return globalsCss.slice(start, globalsCss.indexOf('\n}', start));
}
const lightBlock = blockAfter(':root {');
const darkBlock = blockAfter('.dark {');
const aliasBlock = blockAfter(':root {', globalsCss.indexOf('.dark {'));

function declarations(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) map.set(name, value.trim());
  }
  return map;
}

const LIGHT = new Map([...declarations(lightBlock), ...declarations(aliasBlock)]);
const DARK = new Map([...LIGHT, ...declarations(darkBlock)]);
type Theme = typeof LIGHT;

// Follows var() aliases down to the hex value the theme gives the token.
function hexOf(theme: Theme, token: string): string {
  const value = theme.get(token);
  if (!value) throw new Error(`--${token} is missing`);
  const alias = /^var\(--([\w-]+)\)$/.exec(value);
  if (alias?.[1]) return hexOf(theme, alias[1]);
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`--${token} is not a hex colour: ${value}`);
  return value;
}

// WCAG 2.1 relative luminance of a #rrggbb colour.
function luminanceOf(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [lighter = 0, darker = 0] = [luminanceOf(foreground), luminanceOf(background)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function contrastOf(theme: Theme, foreground: string, background: string): number {
  return contrast(hexOf(theme, foreground), hexOf(theme, background));
}

// WCAG 2.1 AA: 4.5:1 for text; 3:1 for the edge of a form control (1.4.11).
const AA_TEXT = 4.5;
const AA_UI = 3;

// DESIGN-SPEC §1.2, the pairs the redesign was checked against, as token names [text, background].
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['foreground', 'background'],
  ['ink-2', 'background'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'muted'],
  ['muted-foreground', 'card'],
  ['ink-2', 'muted'],
  ['primary-foreground', 'primary'],
  ['primary-foreground', 'primary-hover'],
  ['primary-ink', 'background'],
  ['primary-ink', 'primary-tint'],
  ['primary-ink', 'muted'],
  ['secondary-foreground', 'secondary'],
  ['gold-ink', 'background'],
  ['success-soft-foreground', 'success-soft'],
  ['warning-soft-foreground', 'warning-soft'],
  ['danger-soft-foreground', 'danger-soft'],
  ['info-soft-foreground', 'info-soft'],
  ['neutral-soft-foreground', 'neutral-soft'],
  ['success-foreground', 'success'],
  ['warning-foreground', 'warning'],
  ['info-foreground', 'info'],
  ['destructive-foreground', 'destructive'],
  ['whatsapp-foreground', 'whatsapp'],
  ['sidebar-foreground', 'sidebar-background'],
  ['sidebar-accent-foreground', 'sidebar-accent'],
];

// Text on the dark bands, which keep the same values in either theme.
const BAND_PAIRS: readonly (readonly [string, string])[] = [
  ['on-dark-2', 'night'],
  ['on-dark-3', 'night'],
  ['gold', 'night'],
  ['on-forest', 'forest-night'],
  ['on-forest-2', 'forest-night'],
  ['rw05-hi', 'forest-night'],
  ['on-indigo', 'rw08'],
];

const THEMES = [
  ['light', LIGHT],
  ['dark', DARK],
] as const;

describe('the colour tokens', () => {
  it.each(THEMES)('keep every checked text pair at AA in %s mode', (_mode, theme) => {
    for (const [text, background] of TEXT_PAIRS) {
      expect(contrastOf(theme, text, background), `${text} on ${background}`).toBeGreaterThan(
        AA_TEXT,
      );
    }
  });

  it('keep the text on the dark bands at AA', () => {
    for (const [text, background] of BAND_PAIRS) {
      expect(contrastOf(LIGHT, text, background), `${text} on ${background}`).toBeGreaterThan(
        AA_TEXT,
      );
    }
  });

  it.each(THEMES)(
    'give form controls a 3:1 edge on paper and surface in %s mode',
    (_mode, theme) => {
      expect(contrastOf(theme, 'input', 'background')).toBeGreaterThan(AA_UI);
      expect(contrastOf(theme, 'input', 'card')).toBeGreaterThan(AA_UI);
    },
  );

  it('need primary-ink, because the primary itself fails as text on the paper', () => {
    expect(contrastOf(LIGHT, 'primary', 'background')).toBeLessThan(AA_TEXT);
    expect(hexOf(LIGHT, 'primary-text')).toBe(hexOf(LIGHT, 'primary-ink'));
  });
});

describe('the RW palettes of rw_units.accent_key', () => {
  it.each(THEMES)(
    'read at AA as text on the paper and on their own tint in %s mode',
    (_mode, theme) => {
      for (const key of DB_ENUMS.rw_accent) {
        expect(contrastOf(theme, `rw-${key}`, 'background'), key).toBeGreaterThan(AA_TEXT);
        expect(contrastOf(theme, `rw-${key}`, `rw-${key}-soft`), key).toBeGreaterThan(AA_TEXT);
        expect(contrastOf(theme, `rw-${key}`, 'muted'), key).toBeGreaterThan(AA_TEXT);
      }
    },
  );

  it.each(THEMES)('carry their foreground at AA on the solid accent in %s mode', (_mode, theme) => {
    for (const key of DB_ENUMS.rw_accent) {
      expect(contrastOf(theme, 'on-accent', `rw-${key}`), key).toBeGreaterThan(AA_TEXT);
    }
  });

  it('are exposed to Tailwind with the four classes src/config/rw.ts spells', () => {
    for (const key of DB_ENUMS.rw_accent) {
      for (const suffix of ['', '-foreground', '-soft', '-soft-foreground']) {
        expect(globalsCss).toContain(`--color-rw-${key}${suffix}:`);
      }
      expect(utilitiesCss).toContain(`@utility rw-scope-${key} {`);
    }
  });
});

describe('docs/StyleGuide.md §2.3', () => {
  it('copies the light and dark values of the main tokens', () => {
    for (const token of [
      'background',
      'foreground',
      'primary',
      'primary-ink',
      'rw05',
      'rw13',
      'rw08',
    ]) {
      expect(styleGuide).toContain(`--${token}: ${hexOf(LIGHT, token)};`);
      expect(styleGuide).toContain(`--${token}: ${hexOf(DARK, token)};`);
    }
  });
});

describe('BRAND_HEX', () => {
  it('matches the light tokens the OG images and the manifest stand in for', () => {
    expect(hexOf(LIGHT, 'brand-deep').toUpperCase()).toBe(BRAND_HEX.deep);
    expect(hexOf(LIGHT, 'brand-ice').toUpperCase()).toBe(BRAND_HEX.ice);
    expect(hexOf(LIGHT, 'background').toUpperCase()).toBe(BRAND_HEX.background);
  });
});
