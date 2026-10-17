import { describe, expect, it } from 'vitest';

import { duration, stagger } from './transitions';
import { fadeIn, fadeInDown, fadeInUp, scaleIn, slideInRight, staggerContainer } from './variants';

const MAX_TRANSLATE_PX = 24;

describe('staggerContainer', () => {
  it('staggers short lists by 60 ms after a 100 ms delay', () => {
    expect(staggerContainer(stagger.cap).visible).toEqual({
      transition: { staggerChildren: 0.06, delayChildren: 0.1 },
    });
  });

  it('reveals lists longer than eight items together', () => {
    expect(staggerContainer(stagger.cap + 1).visible).toEqual({
      transition: { staggerChildren: 0, delayChildren: 0.1 },
    });
  });
});

describe('variants', () => {
  const all = { fadeIn, fadeInUp, fadeInDown, scaleIn, slideInRight };

  it('never move further than 24 px', () => {
    for (const variant of Object.values(all)) {
      for (const state of Object.values(variant)) {
        const { x = 0, y = 0 } = state as { x?: number; y?: number };
        expect(Math.abs(x)).toBeLessThanOrEqual(MAX_TRANSLATE_PX);
        expect(Math.abs(y)).toBeLessThanOrEqual(MAX_TRANSLATE_PX);
      }
    }
  });

  it('keep every duration within the 700 ms ceiling', () => {
    expect(Math.max(...Object.values(duration))).toBe(0.7);
  });
});
