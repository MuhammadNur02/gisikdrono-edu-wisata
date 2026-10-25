'use client';

import { Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils/cn';

const PAUSED_ATTRIBUTE = 'data-paused';

export interface MarqueeToggleProps {
  // The id of the .marquee element the button pauses.
  targetId: string;
  // `Jeda`: a toggle keeps its name and says its state through aria-pressed.
  label: string;
  className?: string;
}

// The marquee's data-paused attribute is the one state: every toggle of the same marquee (the heading's and the
// phone's) follows it, so pressing either one updates both.
function usePausedAttribute(targetId: string): boolean {
  const [isPaused, setIsPaused] = useState(false);
  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const sync = () => {
      setIsPaused(target.hasAttribute(PAUSED_ATTRIBUTE));
    };
    const observer = new MutationObserver(sync);
    observer.observe(target, { attributes: true, attributeFilter: [PAUSED_ATTRIBUTE] });
    sync();
    return () => {
      observer.disconnect();
    };
  }, [targetId]);
  return isPaused;
}

// The Jeda toggle of the gallery marquee (DESIGN-SPEC §3.1, §6; WCAG 2.2.2): it sets data-paused on the marquee,
// which stops the CSS track (motion.css), and says so through aria-pressed. Under reduced motion the row does not
// move at all, so the button is not shown.
export function MarqueeToggle({ targetId, label, className }: MarqueeToggleProps) {
  const isPaused = usePausedAttribute(targetId);
  const toggle = () => {
    document.getElementById(targetId)?.toggleAttribute(PAUSED_ATTRIBUTE, !isPaused);
  };
  const Icon = isPaused ? Play : Pause;
  return (
    <button
      type="button"
      aria-controls={targetId}
      aria-pressed={isPaused}
      onClick={toggle}
      className={cn(
        'inline-flex h-11 press-scale items-center justify-center gap-2 rounded-full border border-border-strong px-5 text-label font-semibold transition-colors hover:bg-muted motion-reduce:hidden',
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </button>
  );
}
