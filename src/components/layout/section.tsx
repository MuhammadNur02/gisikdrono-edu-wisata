import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { Container } from '@/components/layout/container';
import {
  WaveDivider,
  type WaveDividerProps,
  type WaveTone,
} from '@/components/layout/wave-divider';
import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §5.7: one Section per idea. Inner pages alternate default and muted; the home page alternates
// default and the opaque warm tone, with a wave where the tone changes (decision of 2026-10-23). `brand` is the CTA
// band.
export type SectionTone = 'default' | 'muted' | 'warm' | 'brand';
export type SectionAlign = 'left' | 'center';

// scroll-mt-17 keeps an anchored section (/#kampung, /rw-05-ecowastreme#profil) clear of the sticky header: its h-16
// plus the 1 px border below it. `relative` holds the section's wave.
const sectionVariants = cva('relative scroll-mt-17 py-16 md:py-24', {
  variants: {
    tone: {
      default: 'bg-background',
      muted: 'bg-muted/40',
      warm: 'bg-surface-warm',
      brand: 'bg-background',
    },
  },
});

// The colour a section's wave is painted in. The translucent muted tone takes none (WaveDivider).
const WAVE_TONE_OF: Record<SectionTone, WaveTone | null> = {
  default: 'background',
  muted: null,
  warm: 'warm',
  brand: 'background',
};

const headingVariants = cva('max-w-3xl space-y-3', {
  variants: { align: { left: '', center: 'mx-auto text-center' } },
});

export type SectionWave = Omit<WaveDividerProps, 'tone'>;

export interface SectionShellProps {
  id?: string;
  // The id of the section's heading.
  labelledBy: string;
  tone?: SectionTone;
  // A wave on top, painted in this section's tone over the bottom of the section above.
  wave?: SectionWave;
  // Content that runs edge to edge after the container, such as a photo band or a scroll strip.
  bleed?: ReactNode;
  children: ReactNode;
}

// The section element with its tone, wave and container, for a block that lays out its own heading (WhyVisit).
export function SectionShell({
  id,
  labelledBy,
  tone = 'default',
  wave,
  bleed,
  children,
}: SectionShellProps) {
  const waveTone = WAVE_TONE_OF[tone];
  return (
    <section id={id} aria-labelledby={labelledBy} className={sectionVariants({ tone })}>
      {wave && waveTone ? <WaveDivider tone={waveTone} {...wave} /> : null}
      <Container>{children}</Container>
      {bleed ? <div className="mt-10 md:mt-12">{bleed}</div> : null}
    </section>
  );
}

export interface SectionProps extends Pick<SectionShellProps, 'tone' | 'wave' | 'bleed'> {
  // Also the anchor other pages link to, such as /rw-05-ecowastreme#profil.
  id: string;
  title: string;
  eyebrow?: ReactNode;
  description?: string;
  align?: SectionAlign;
  // A section a header link points at (/#kampung): following the link moves the focus to its heading as well, so a
  // keyboard or screen-reader user goes on from there and not from the top of the page. The heading carries the id and
  // takes the focus rather than the whole section: Chrome centres a focused element taller than the window, which would
  // scroll the heading out of sight. It draws no ring of its own.
  isLinkTarget?: boolean;
  // The `see all` link, beside the heading from lg and under it below (`Lihat semua paket`).
  headerAction?: ReactNode;
  children?: ReactNode;
}

interface SectionHeadingProps {
  titleId: string;
  title: string;
  eyebrow?: ReactNode;
  description?: string;
  align: SectionAlign;
  isOnBrand: boolean;
  // Set when the section is a link target: the heading carries the section's id and takes the focus.
  anchorId?: string;
}

function SectionHeading({
  titleId,
  title,
  eyebrow,
  description,
  align,
  isOnBrand,
  anchorId,
}: SectionHeadingProps) {
  return (
    <div
      id={anchorId}
      tabIndex={anchorId === undefined ? undefined : -1}
      className={cn(
        headingVariants({ align }),
        anchorId !== undefined && 'scroll-mt-17 outline-none',
      )}
    >
      {eyebrow ? (
        <p className={cn('text-overline', isOnBrand ? 'text-brand-ice' : 'text-primary-text')}>
          {eyebrow}
        </p>
      ) : null}
      <h2 id={titleId} className="text-h2">
        {title}
      </h2>
      {description ? (
        <p className={cn('text-body-lg', isOnBrand ? 'text-brand-ice' : 'text-muted-foreground')}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

// The only decorative pattern of the brand band (docs/StyleGuide.md §1.3 G2, §8.5), at 6 % opacity.
function DotGrid({ patternId }: { patternId: string }) {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full opacity-6">
      <defs>
        <pattern id={patternId} width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.5" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

// The brand tone sets the section's content in the dark brand panel with its dot grid.
function BrandPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-brand-deep px-6 py-12 text-white md:px-12 md:py-16">
      <DotGrid patternId={`${id}-titik`} />
      {children}
    </div>
  );
}

function HeadingRow({ heading, action }: { heading: ReactNode; action?: ReactNode }) {
  if (!action) return heading;
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      {heading}
      {action}
    </div>
  );
}

export function Section({
  id,
  tone = 'default',
  align = 'left',
  isLinkTarget = false,
  wave,
  bleed,
  headerAction,
  children,
  ...heading
}: SectionProps) {
  const titleId = `${id}-judul`;
  const isOnBrand = tone === 'brand';
  const headingBlock = (
    <SectionHeading
      titleId={titleId}
      align={align}
      isOnBrand={isOnBrand}
      anchorId={isLinkTarget ? id : undefined}
      {...heading}
    />
  );
  const body = (
    <div className="relative space-y-10">
      <HeadingRow heading={headingBlock} action={headerAction} />
      {children}
    </div>
  );
  return (
    <SectionShell
      id={isLinkTarget ? undefined : id}
      labelledBy={titleId}
      tone={tone}
      wave={wave}
      bleed={bleed}
    >
      {isOnBrand ? <BrandPanel id={id}>{body}</BrandPanel> : body}
    </SectionShell>
  );
}
