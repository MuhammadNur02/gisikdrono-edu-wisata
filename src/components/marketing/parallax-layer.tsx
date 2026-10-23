'use client';

import { m, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef, type ReactNode } from 'react';

import { MEDIA_MD_UP, useMediaQuery } from '@/hooks/use-media-query';
import { parallax } from '@/lib/motion/transitions';

// docs/StyleGuide.md §7.3 (decision of 2026-10-23): a decorative photo drifts against the page's own scroll,
// after dusunbambu.id's parallax bands. The page scrolls natively: no wheel handler, no smooth-scroll library. The
// layer is taller than its frame (--parallax-overscan) on the server too, so turning the drift on moves nothing.
// A MotionValue bound to style is not covered by MotionConfig's reducedMotion, so it is gated by hand, and below
// md, where it would only cost a mid-range phone its frames (§1.1 P3), the photo stays still.
const SCROLL_OFFSET: ['start end', 'end start'] = ['start end', 'end start'];
const SCROLL_RANGE = [0, 1];

export interface ParallaxLayerProps {
  // The photo, rendered on the server; it fills the layer.
  children: ReactNode;
}

export function ParallaxLayer({ children }: ParallaxLayerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const isWide = useMediaQuery(MEDIA_MD_UP);
  const prefersReducedMotion = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: frameRef, offset: SCROLL_OFFSET });
  const y = useTransform(scrollYProgress, SCROLL_RANGE, [`-${parallax.shift}`, parallax.shift]);
  const drifts = isWide && !prefersReducedMotion;
  return (
    <div ref={frameRef} className="absolute inset-0 overflow-hidden">
      <m.div
        style={drifts ? { y } : undefined}
        className="absolute inset-x-0 top-1/2 h-(--parallax-overscan) -translate-y-1/2"
      >
        {children}
      </m.div>
    </div>
  );
}
