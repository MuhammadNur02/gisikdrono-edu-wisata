import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { isRwId, RW_ACCENTS, RW_IDS, RW_PROGRAMMES } from './rw';

const globalsCss = readFileSync(new URL('../styles/globals.css', import.meta.url), 'utf8');

// Every colour a class names (bg-rw05-soft -> rw05-soft) must exist as --color-* in @theme inline,
// or Tailwind silently generates nothing and the accent disappears.
function colourOf(className: string): string {
  return className.replace(/^(text|bg|border)-/, '');
}

describe('RW_ACCENTS', () => {
  it('covers both RWs, RW 05 first', () => {
    expect(RW_IDS).toEqual([5, 8]);
    expect(Object.keys(RW_ACCENTS).map(Number)).toEqual([5, 8]);
  });

  it('names only colours that globals.css exposes to Tailwind', () => {
    const slots = ['text', 'fill', 'soft', 'border'] as const;
    const classNames = RW_IDS.flatMap((rwId) =>
      slots.flatMap((slot) => RW_ACCENTS[rwId][slot].split(' ')),
    );
    for (const className of classNames) {
      expect(globalsCss).toContain(
        `--color-${colourOf(className)}: hsl(var(--${colourOf(className)}));`,
      );
    }
  });

  it('defines every RW variable for light and dark mode', () => {
    const [light = '', dark = ''] = globalsCss.split('.dark {');
    for (const rw of ['rw05', 'rw08']) {
      for (const suffix of ['', '-foreground', '-soft', '-soft-foreground']) {
        expect(light).toContain(`--${rw}${suffix}:`);
        expect(dark).toContain(`--${rw}${suffix}:`);
      }
    }
  });
});

describe('RW_PROGRAMMES', () => {
  const seed = readFileSync(
    new URL('../../supabase/migrations/0008_seed.sql', import.meta.url),
    'utf8',
  );

  it('uses the rw_units slug of the seed as the page path', () => {
    for (const rwId of RW_IDS) {
      const programme = RW_PROGRAMMES[rwId];
      expect(seed).toContain(`(${String(rwId)}, 'RW0${String(rwId)}', '${programme.slug}',`);
      expect(programme.path).toBe(`/${programme.slug}`);
    }
  });

  it('labels each RW with its two-digit number', () => {
    expect(RW_IDS.map((rwId) => RW_PROGRAMMES[rwId].label)).toEqual(['RW 05', 'RW 08']);
  });
});

describe('isRwId', () => {
  it('accepts the two RWs and nothing else', () => {
    expect(isRwId(5)).toBe(true);
    expect(isRwId(8)).toBe(true);
    expect(isRwId(1)).toBe(false);
    expect(isRwId(0)).toBe(false);
  });
});
