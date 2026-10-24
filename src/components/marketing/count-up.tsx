'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

import { duration } from '@/lib/motion/transitions';

// docs/StyleGuide.md §7.3 (decision of 2026-10-23): a home figure counts up once as it comes into view, after
// reactbits.dev's CountUp idea (MIT + Commons Clause; re-implemented here, no source copied). A short rAF tween
// with the browser's own IntersectionObserver and matchMedia, so no motion code reaches the page (first-load
// budget, decision of 2026-10-24). The server renders the final figure, so a visitor without script, or one who
// asks for reduced motion (§7.4), reads the truth at once; the final figure also holds the width, so counting
// never shifts the layout.
const MS_PER_SECOND = 1000;
const TWEEN_MS = duration.max * MS_PER_SECOND;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
// The exponential ease-out of ease.outExpo, written as a function: fast at first, settling at the end.
const EXPO_BASE = 2;
const EXPO_STEEPNESS = -10;
const numberFormat = new Intl.NumberFormat('id-ID');

function easeOutExpo(progress: number): number {
  return progress >= 1 ? 1 : 1 - EXPO_BASE ** (EXPO_STEEPNESS * progress);
}

function tweenTo(target: number, onFrame: (value: number) => void): () => void {
  let frame = 0;
  const startedAt = performance.now();
  const step = (now: number) => {
    const progress = Math.min((now - startedAt) / TWEEN_MS, 1);
    onFrame(Math.round(target * easeOutExpo(progress)));
    if (progress < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(frame);
  };
}

function isOnScreen(element: HTMLElement): boolean {
  const { top, bottom } = element.getBoundingClientRect();
  return bottom > 0 && top < window.innerHeight;
}

// Counts from zero once the figure enters the screen; returns the cleanup.
function countWhenSeen(element: HTMLElement, value: number, onFrame: (value: number) => void) {
  let cancelTween: (() => void) | null = null;
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) return;
    observer.disconnect();
    cancelTween = tweenTo(value, onFrame);
  });
  observer.observe(element);
  return () => {
    observer.disconnect();
    cancelTween?.();
  };
}

// A figure already on screen at hydration stays final: resetting it in view would flash.
// onMount (an admin KPI, §6.3): the figure is already on screen when the dashboard opens, so it counts once at once.
function useCountUp(
  value: number,
  ref: RefObject<HTMLSpanElement | null>,
  onMount: boolean,
): number {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia(REDUCED_MOTION).matches) return;
    if (onMount) {
      setShown(0);
      return tweenTo(value, setShown);
    }
    if (isOnScreen(element)) return;
    setShown(0);
    return countWhenSeen(element, value, setShown);
  }, [ref, value, onMount]);
  return shown;
}

export interface CountUpProps {
  value: number;
  onMount?: boolean;
}

export function CountUp({ value, onMount = false }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useCountUp(value, ref, onMount);
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
