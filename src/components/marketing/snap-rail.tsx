'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { uiCopy } from '@/lib/copy/ui';
import { cn } from '@/lib/utils/cn';

const BACK = -1;
const FORWARD = 1;

export interface SnapRailProps {
  // The id of the scroll-snap list the rail follows and moves.
  targetId: string;
  // How many items the list holds: one bar each.
  count: number;
  // Shows the previous and next buttons (the reviews slider), with these classes.
  buttonsClassName?: string;
  // Shows the bars, with these classes (`md:hidden` and the like come from the caller).
  barsClassName?: string;
}

// The item whose start is nearest the list's scroll start.
function activeIndexOf(list: HTMLElement): number {
  const starts = [...list.children].flatMap((item) =>
    item instanceof HTMLElement
      ? [Math.abs(item.offsetLeft - list.offsetLeft - list.scrollLeft)]
      : [],
  );
  return starts.indexOf(Math.min(...starts));
}

interface SnapState {
  active: number;
  isAtEnd: boolean;
}

function useSnapState(targetId: string): SnapState {
  const [state, setState] = useState<SnapState>({ active: 0, isAtEnd: false });
  useEffect(() => {
    const list = document.getElementById(targetId);
    if (!list) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const isAtEnd = list.scrollLeft + list.clientWidth >= list.scrollWidth - 1;
        setState({ active: Math.max(0, activeIndexOf(list)), isAtEnd });
      });
    };
    update();
    list.addEventListener('scroll', update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      list.removeEventListener('scroll', update);
    };
  }, [targetId]);
  return state;
}

const BUTTON_CLASS =
  'flex size-12 items-center justify-center rounded-full border-control border-foreground text-foreground press-scale transition-colors hover:not-disabled:bg-muted disabled:cursor-default disabled:border-border-strong disabled:text-muted-foreground disabled:opacity-45';

// Scrolls the list by one item and its gap.
function stepList(targetId: string, direction: number) {
  const list = document.getElementById(targetId);
  const item = list?.firstElementChild;
  if (!list || !(item instanceof HTMLElement)) return;
  const gap = Number.parseFloat(getComputedStyle(list).columnGap) || 0;
  list.scrollBy({ left: direction * (item.offsetWidth + gap) });
}

function RailButtons({
  targetId,
  state,
  className,
}: {
  targetId: string;
  state: SnapState;
  className: string;
}) {
  const step = useCallback(
    (direction: number) => {
      stepList(targetId, direction);
    },
    [targetId],
  );
  const buttons = [
    { direction: BACK, disabled: state.active === 0, icon: ArrowLeft, label: uiCopy.previousSlide },
    { direction: FORWARD, disabled: state.isAtEnd, icon: ArrowRight, label: uiCopy.nextSlide },
  ];
  return (
    <div className={cn('flex gap-3', className)}>
      {buttons.map((button) => (
        <button
          key={button.label}
          type="button"
          aria-controls={targetId}
          disabled={button.disabled}
          onClick={() => {
            step(button.direction);
          }}
          className={BUTTON_CLASS}
        >
          <button.icon aria-hidden className="size-5" />
          <span className="sr-only">{button.label}</span>
        </button>
      ))}
    </div>
  );
}

function RailBars({
  count,
  active,
  className,
}: {
  count: number;
  active: number;
  className: string;
}) {
  return (
    <div aria-hidden className={cn('flex gap-2', className)}>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-1 rounded-full transition-[width,background-color] duration-300 ease-out-soft',
            index === active ? 'w-8 bg-foreground' : 'w-3 bg-border-strong',
          )}
        />
      ))}
    </div>
  );
}

// DESIGN-SPEC §3.1 and §4 (Reviews slider, mobile carousels): a scroll-snap row moved by the visitor only. The buttons
// step one card; the bars mark the card at the start of the row, its bar stretching to 32 px (300 ms, out-soft). The
// row itself scrolls natively (swipe, or the arrow keys once focused), so the rail is a convenience, never the only
// way. A few hundred bytes of script and no carousel library (first-load budget).
export function SnapRail({ targetId, count, buttonsClassName, barsClassName }: SnapRailProps) {
  const state = useSnapState(targetId);
  return (
    <>
      {buttonsClassName === undefined ? null : (
        <RailButtons targetId={targetId} state={state} className={buttonsClassName} />
      )}
      {barsClassName === undefined ? null : (
        <RailBars count={count} active={state.active} className={barsClassName} />
      )}
    </>
  );
}
