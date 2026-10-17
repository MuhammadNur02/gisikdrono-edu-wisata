import type { Variants } from 'motion/react';

import { duration, ease, spring, stagger } from './transitions';

// docs/StyleGuide.md §7.2: translations stay within 24 px and blur is never animated, so the
// reduced-motion fallback (opacity only) still reads naturally.
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: duration.base, ease: ease.outExpo } },
  exit: { opacity: 0, transition: { duration: duration.short } },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.outExpo } },
  exit: { opacity: 0, y: 8 },
};

export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -16 },
  visible: { opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.outExpo } },
  exit: { opacity: 0 },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: duration.short, ease: ease.outExpo } },
  exit: { opacity: 0, scale: 0.98 },
};

export const slideInRight: Variants = {
  hidden: { x: 24, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: spring.soft },
  exit: { x: 24, opacity: 0 },
};

export function staggerContainer(count: number): Variants {
  return {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: count <= stagger.cap ? stagger.children : 0,
        delayChildren: stagger.delay,
      },
    },
  };
}
