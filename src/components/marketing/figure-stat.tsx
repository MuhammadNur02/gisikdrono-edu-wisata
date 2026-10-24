import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

// Where the figure stands: on the paper, or in the forest band, where cells are divided by white 14 % rules.
const TONES = {
  paper: { cell: 'border-t border-border pt-4', value: 'text-foreground', label: 'text-ink-2' },
  forest: {
    cell: 'border-white/14 lg:border-l lg:pl-8 lg:first:border-l-0 lg:first:pl-0',
    value: 'text-on-dark',
    label: 'text-on-forest',
  },
} as const;

export type FigureStatTone = keyof typeof TONES;

export interface FigureStatProps {
  // The figure, usually a CountUp; formatted by the caller.
  value: ReactNode;
  label: string;
  tone?: FigureStatTone;
  className?: string;
}

// Figure Stat of DESIGN-SPEC §2.6: the number in the figure size (80 to 52 px, tabular) over its label (15/1.45),
// 8 px apart. A definition-list pair, so it belongs in a <dl>, which FiguresPanel provides.
export function FigureStat({ value, label, tone = 'paper', className }: FigureStatProps) {
  const colours = TONES[tone];
  return (
    <div className={cn('flex flex-col-reverse gap-2', colours.cell, className)}>
      <dt className={cn('text-body-md', colours.label)}>{label}</dt>
      <dd className={cn('text-figure', colours.value)}>{value}</dd>
    </div>
  );
}

export interface FiguresPanelProps {
  title: string;
  // The source of the figures, at the end of the title row (`Dihitung dari data kampung di situs ini`).
  note?: string;
  children: ReactNode;
  className?: string;
}

// The figures band of DESIGN-SPEC §3.1: an inset forest panel, radius 24, with the light kawung at 7 %, a gold title
// and four FigureStat cells (2 x 2 on phones). It rises in as it comes into view; the counting is the CountUps' own.
export function FiguresPanel({ title, note, children, className }: FiguresPanelProps) {
  return (
    <div
      className={cn(
        'kawung reveal rounded-3xl bg-forest-night px-6 pt-8 pb-9 text-white ring-on-dark kawung-7 reveal-lg md:px-16 md:pt-13 md:pb-14',
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="text-eyebrow text-gold">{title}</p>
        {note ? <p className="text-caption text-on-forest-2">{note}</p> : null}
      </div>
      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 md:mt-10 lg:grid-cols-4 lg:gap-x-8">
        {children}
      </dl>
    </div>
  );
}
