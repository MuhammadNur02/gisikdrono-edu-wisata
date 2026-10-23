'use client';

import { cubicBezier, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { duration, ease } from '@/lib/motion/transitions';

// docs/StyleGuide.md §7.3 (decision of 2026-10-23): a home figure counts up once as it comes into view, after
// reactbits.dev's CountUp idea (MIT + Commons Clause; re-implemented here, no source copied). A short rAF tween
// instead of motion's animate(), which would ship far more script. The server renders the final figure, so a
// visitor without script, or one who asks for reduced motion (§7.4), reads the truth at once; the final figure
// also holds the width, so counting never shifts the layout.
const MS_PER_SECOND = 1000;
const TWEEN_MS = duration.max * MS_PER_SECOND;
const easeOut = cubicBezier(...ease.outExpo);
const numberFormat = new Intl.NumberFormat('id-ID');

function tweenTo(target: number, onFrame: (value: number) => void): () => void {
  let frame = 0;
  const startedAt = performance.now();
  const step = (now: number) => {
    const progress = Math.min((now - startedAt) / TWEEN_MS, 1);
    onFrame(Math.round(target * easeOut(progress)));
    if (progress < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(frame);
  };
}

function isOnScreen(element: HTMLElement | null): boolean {
  if (!element) return false;
  const { top, bottom } = element.getBoundingClientRect();
  return bottom > 0 && top < window.innerHeight;
}

// The figure stays final when it is already on screen at hydration: resetting it in view would flash.
function useCountUp(value: number, ref: RefObject<HTMLSpanElement | null>): number {
  const [shown, setShown] = useState(value);
  const [counts, setCounts] = useState(false);
  const isInView = useInView(ref, { once: true });
  const prefersReducedMotion = useReducedMotion() ?? false;
  useEffect(() => {
    if (prefersReducedMotion || isOnScreen(ref.current)) return;
    setCounts(true);
    setShown(0);
  }, [prefersReducedMotion, ref]);
  useEffect(() => {
    if (!counts || !isInView) return;
    return tweenTo(value, setShown);
  }, [counts, isInView, value]);
  return shown;
}

export interface CountUpProps {
  value: number;
}

export function CountUp({ value }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useCountUp(value, ref);
  const final = numberFormat.format(value);
  return (
    <span ref={ref} className="inline-grid tabular-nums">
      <span className="sr-only">{final}</span>
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {final}
      </span>
      <span aria-hidden className="col-start-1 row-start-1">
        {numberFormat.format(shown)}
      </span>
    </span>
  );
}
