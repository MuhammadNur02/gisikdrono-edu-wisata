import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

// The emblem's two looks (DESIGN-SPEC §3.14): the current RW's tint with the ink kawung for an empty list (the RW comes
// from an rw-scope-* on the state or an ancestor; outside one it is the brick of the site), the danger tint for an error.
const EMBLEM_TONE = {
  rw: 'kawung kawung-ink kawung-12 bg-rw-soft text-rw',
  danger: 'bg-danger-soft text-danger',
} as const;

export type StateTone = keyof typeof EMBLEM_TONE;

export interface StateEmblemProps {
  icon: LucideIcon;
  tone: StateTone;
}

// A 144 px circle (112 on phones) holding a 72 px surface circle with the 34 px icon.
export function StateEmblem({ icon, tone }: StateEmblemProps) {
  const Icon = icon;
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-full md:size-36',
        EMBLEM_TONE[tone],
      )}
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-card md:size-18">
        <Icon className="size-7 md:size-8.5" strokeWidth={1.75} />
      </span>
    </span>
  );
}

export interface CatalogueStateProps extends StateEmblemProps {
  title: string;
  description: string;
  // The buttons under the text: clear the filters, ask on WhatsApp, try again.
  actions?: ReactNode;
  // `status` for an empty answer to the visitor's own filter, `alert` for a failure.
  role?: 'status' | 'alert';
  // The heading level the page needs at this place.
  headingLevel?: 'h2' | 'h3';
  className?: string;
}

// The empty and error states of the catalogue lists (DESIGN-SPEC §3.14): the emblem, the title (Jakarta 30/700, 22 on
// phones), the description (17, at most 560 px, centred) and the actions, full width on phones. They arrive with a
// small scale and fade, never a shake.
export function CatalogueState({
  icon,
  tone,
  title,
  description,
  actions,
  role,
  headingLevel = 'h2',
  className,
}: CatalogueStateProps) {
  const Heading = headingLevel;
  return (
    <div
      role={role}
      className={cn(
        'mx-auto flex max-w-140 state-enter flex-col items-center gap-5 py-12 text-center md:gap-6 md:py-20',
        className,
      )}
    >
      <StateEmblem icon={icon} tone={tone} />
      <div className="space-y-3">
        <Heading className="font-display text-xl leading-tight font-bold text-balance md:text-3xl">
          {title}
        </Heading>
        <p className="text-body-lg text-pretty text-ink-2">{description}</p>
      </div>
      {actions ? (
        <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
