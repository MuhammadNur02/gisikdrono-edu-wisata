import { describe, expect, it } from 'vitest';

import { cn, TYPE_SCALE_STEPS } from './cn';

describe('cn', () => {
  it('keeps a type-scale step next to a text colour', () => {
    for (const step of TYPE_SCALE_STEPS) {
      expect(cn(`text-${step}`, 'text-muted-foreground')).toBe(
        `text-${step} text-muted-foreground`,
      );
    }
  });

  it('lets a later type-scale step replace an earlier one', () => {
    expect(cn('text-h1', 'text-h2')).toBe('text-h2');
    expect(cn('text-body-sm', 'text-caption')).toBe('text-caption');
  });

  it('treats type-scale steps and Tailwind sizes as the same group', () => {
    expect(cn('text-sm', 'text-body-sm')).toBe('text-body-sm');
    expect(cn('text-body', 'text-lg')).toBe('text-lg');
  });

  it('still merges ordinary conflicts and drops falsy values', () => {
    expect(cn('px-3', false, undefined, 'px-4', { 'font-medium': true, hidden: false })).toBe(
      'px-4 font-medium',
    );
  });
});

describe('cn and the 1.5 px control border', () => {
  it('keeps border-control next to a border colour, and lets a later width replace it', () => {
    expect(cn('border-control', 'border-foreground')).toBe('border-control border-foreground');
    expect(cn('border-control', 'border-2')).toBe('border-2');
  });
});
