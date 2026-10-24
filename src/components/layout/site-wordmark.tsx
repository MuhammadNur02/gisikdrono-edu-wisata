import { Clover } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

// Where the wordmark stands: the header follows its own state (white over the hero photo, ink once solid), `ink`
// sits on paper (the menu drawer), `light` on a dark band (the footer).
const TONES = {
  header: { eyebrow: 'text-header-fg-3', name: 'text-header-fg' },
  ink: { eyebrow: 'text-muted-foreground', name: 'text-foreground' },
  light: { eyebrow: 'text-on-dark-2', name: 'text-white' },
} as const;

export interface SiteWordmarkProps {
  tone?: keyof typeof TONES;
  // The drawer shows the name alone beside its close button.
  showEyebrow?: boolean;
  className?: string;
}

// DESIGN-SPEC §1.6 (docs/StyleGuide.md §11 D1, until the kelurahan supplies a logo): a 38 px brick square (34 on
// phones) with lucide Clover, read as the four petals of a kawung flower, then EDU WISATA over Gisikdrono.
export function SiteWordmark({ tone = 'ink', showEyebrow = true, className }: SiteWordmarkProps) {
  const colours = TONES[tone];
  return (
    <span className={cn('flex items-center gap-3', className)}>
      <span
        aria-hidden
        className="flex size-8.5 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground md:size-9.5"
      >
        <Clover className="size-5 md:size-5.5" strokeWidth={2} />
      </span>
      <span className="flex flex-col gap-1">
        {showEyebrow ? (
          <span className={cn('text-wordmark-eyebrow', colours.eyebrow)}>Edu Wisata</span>
        ) : null}
        <span className={cn('text-wordmark', colours.name)}>Gisikdrono</span>
      </span>
    </span>
  );
}
