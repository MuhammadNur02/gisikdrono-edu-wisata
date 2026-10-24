'use client';

import { useEffect, useRef } from 'react';

// DESIGN-SPEC §4 (Home, figures): a figure counts from zero once, as it comes into view (40 % of it on screen), over
// 1.4 s on the expo ease-out, and a row of figures starts 120 ms apart (`delayMs`). It is the browser's own
// IntersectionObserver and requestAnimationFrame writing the digits straight into the text node, so counting renders
// nothing and ships no motion library (first-load budget). The server renders the final figure, so a visitor without
// script, or one who asks for reduced motion, reads the truth at once; an invisible copy of the final figure holds
// the width, so counting never shifts the layout, and screen readers hear only the final figure.
const COUNT_MS = 1400;
const VISIBLE_SHARE = 0.4;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
// The exponential ease-out of ease.outExpo, written as a function: fast at first, settling at the end.
const EXPO_BASE = 2;
const EXPO_STEEPNESS = -10;
const numberFormat = new Intl.NumberFormat('id-ID');

function easeOutExpo(progress: number): number {
  return progress >= 1 ? 1 : 1 - EXPO_BASE ** (EXPO_STEEPNESS * progress);
}

// Writes the tween into the element; returns the cancel.
function countInto(element: HTMLElement, target: number, delayMs: number): () => void {
  let frame = 0;
  let startedAt: number | null = null;
  const step = (now: number) => {
    startedAt ??= now + delayMs;
    const progress = Math.max(0, Math.min((now - startedAt) / COUNT_MS, 1));
    element.textContent = numberFormat.format(Math.round(target * easeOutExpo(progress)));
    if (progress < 1) frame = requestAnimationFrame(step);
  };
  element.textContent = numberFormat.format(0);
  frame = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(frame);
    element.textContent = numberFormat.format(target);
  };
}

function isOnScreen(element: HTMLElement): boolean {
  const { top, bottom } = element.getBoundingClientRect();
  return bottom > 0 && top < window.innerHeight;
}

// Counts once the figure is seen; returns the cleanup.
function countWhenSeen(element: HTMLElement, target: number, delayMs: number): () => void {
  let cancelCount: (() => void) | null = null;
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      cancelCount = countInto(element, target, delayMs);
    },
    { threshold: VISIBLE_SHARE },
  );
  observer.observe(element);
  return () => {
    observer.disconnect();
    cancelCount?.();
  };
}

export interface CountUpProps {
  value: number;
  // An admin KPI is on screen as the dashboard opens, so it counts once at once (docs/StyleGuide.md §6.3).
  onMount?: boolean;
  // The stagger within a row of figures.
  delayMs?: number;
}

export function CountUp({ value, onMount = false, delayMs = 0 }: CountUpProps) {
  const digitsRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const digits = digitsRef.current;
    if (!digits || window.matchMedia(REDUCED_MOTION).matches) return;
    if (onMount) return countInto(digits, value, delayMs);
    // A figure already on screen at hydration stays final: resetting it in view would flash.
    if (isOnScreen(digits)) return;
    return countWhenSeen(digits, value, delayMs);
  }, [value, onMount, delayMs]);
  const final = numberFormat.format(value);
  return (
    <span className="inline-grid tabular-nums">
      <span className="sr-only">{final}</span>
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {final}
      </span>
      <span ref={digitsRef} aria-hidden className="col-start-1 row-start-1">
        {final}
      </span>
    </span>
  );
}
