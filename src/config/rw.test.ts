import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DB_ENUMS } from '@/db/enums';

import {
  NEUTRAL_ACCENT_CLASSES,
  RW_ACCENT_CLASSES,
  rwAccentClasses,
  rwLabel,
  rwNumber,
  softClassesFor,
} from './rw';
import { RW_ICONS } from './rw-icons';

const globalsCss = readFileSync(new URL('../styles/globals.css', import.meta.url), 'utf8');
const utilitiesCss = readFileSync(new URL('../styles/utilities.css', import.meta.url), 'utf8');
const SLOTS = ['text', 'fill', 'soft', 'border'] as const;

// Every colour a class names (bg-rw-leaf-soft -> rw-leaf-soft) must exist as --color-* in @theme inline,
// or Tailwind silently generates nothing and the accent disappears.
function colourOf(className: string): string {
  return className.replace(/^(text|bg|border)-/, '');
}

describe('RW_ACCENT_CLASSES', () => {
  it('has a palette for every rw_units.accent_key and nothing else', () => {
    expect(Object.keys(RW_ACCENT_CLASSES)).toEqual([...DB_ENUMS.rw_accent]);
  });

  it('names only colours that globals.css exposes to Tailwind', () => {
    const classNames = DB_ENUMS.rw_accent.flatMap((key) =>
      SLOTS.flatMap((slot) => RW_ACCENT_CLASSES[key][slot].split(' ')),
    );
    for (const className of classNames) {
      expect(globalsCss).toContain(`--color-${colourOf(className)}:`);
    }
  });

  // The values and their contrast in both themes are proven in src/styles/globals.test.ts.
  it('gives every palette a scope class that utilities.css defines', () => {
    for (const key of DB_ENUMS.rw_accent) {
      expect(RW_ACCENT_CLASSES[key].scope).toBe(`rw-scope-${key}`);
      expect(utilitiesCss).toContain(`@utility rw-scope-${key} {`);
    }
    expect(utilitiesCss).toContain(`@utility ${NEUTRAL_ACCENT_CLASSES.scope} {`);
  });

  it('keeps clear of the shadcn --accent token', () => {
    expect(globalsCss).not.toMatch(/--accent-(leaf|terracotta|mulberry|teal|violet)/);
  });
});

describe('rwAccentClasses and softClassesFor', () => {
  it('hands out a palette by key, and the neutral pair for an RW that is offline', () => {
    expect(rwAccentClasses('leaf')).toBe(RW_ACCENT_CLASSES.leaf);
    expect(rwAccentClasses(null)).toBe(NEUTRAL_ACCENT_CLASSES);
  });

  it('tints a photo slot for one RW only', () => {
    expect(softClassesFor([{ accentKey: 'mulberry' }])).toBe(RW_ACCENT_CLASSES.mulberry.soft);
    expect(softClassesFor([])).toBe(NEUTRAL_ACCENT_CLASSES.soft);
    expect(softClassesFor([{ accentKey: 'leaf' }, { accentKey: 'terracotta' }])).toBe(
      NEUTRAL_ACCENT_CLASSES.soft,
    );
    expect(softClassesFor([{ accentKey: null }])).toBe(NEUTRAL_ACCENT_CLASSES.soft);
  });
});

describe('RW_ICONS', () => {
  it('has an icon for every rw_units.icon_key', () => {
    expect(Object.keys(RW_ICONS)).toEqual([...DB_ENUMS.rw_icon]);
  });
});

describe('rwNumber and rwLabel', () => {
  it('write an RW number with two digits, as the code, the folder and the tag do', () => {
    expect(rwNumber(5)).toBe('05');
    expect(rwNumber(13)).toBe('13');
    expect(rwLabel(8)).toBe('RW 08');
    expect(rwLabel(13)).toBe('RW 13');
  });
});
