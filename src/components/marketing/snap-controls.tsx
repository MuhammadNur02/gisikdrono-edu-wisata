'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';

import { uiCopy } from '@/lib/copy/ui';

const BACK = -1;
const FORWARD = 1;

const controlClassName =
  'flex size-11 items-center justify-center rounded-full border border-border bg-background transition-colors hover:bg-accent';

export interface SnapControlsProps {
  // The id of the scroll-snap row the buttons move.
  targetId: string;
}

// docs/StyleGuide.md §5.7 (decision of 2026-10-23): previous and next for a scroll-snap row, one screenful at a
// time. The row itself scrolls natively (swipe, arrow keys once focused); these are for a mouse from md, and
// the row's own scroll-behavior (smooth, or instant for reduced motion) applies. Nothing moves on its own.
export function SnapControls({ targetId }: SnapControlsProps) {
  function scrollRow(direction: number) {
    const row = document.getElementById(targetId);
    row?.scrollBy({ left: direction * row.clientWidth });
  }
  return (
    <div className="hidden gap-2 md:flex">
      <button
        type="button"
        aria-controls={targetId}
        onClick={() => {
          scrollRow(BACK);
        }}
        className={controlClassName}
      >
        <ArrowLeft aria-hidden className="size-4" />
        <span className="sr-only">{uiCopy.previousSlide}</span>
      </button>
      <button
        type="button"
        aria-controls={targetId}
        onClick={() => {
          scrollRow(FORWARD);
        }}
        className={controlClassName}
      >
        <ArrowRight aria-hidden className="size-4" />
        <span className="sr-only">{uiCopy.nextSlide}</span>
      </button>
    </div>
  );
}
