'use client';

import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';

import { duration, ease } from '@/lib/motion/transitions';

// docs/StyleGuide.md §7.1: wraps a motion island inside its own lazy chunk (never the root layout, which would ship
// motion with every page). Strict LazyMotion, so components animate with `m.*` and the full `motion`
// bundle never ships. reducedMotion="user" turns transforms into plain fades for people who ask for it.
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig
        reducedMotion="user"
        transition={{ duration: duration.base, ease: ease.outExpo }}
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
