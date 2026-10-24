import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { Container } from '@/components/layout/container';
import { SectionHeading, type SectionHeadingProps } from '@/components/layout/section-heading';
import {
  WaveDivider,
  type WaveDividerProps,
  type WaveTone,
} from '@/components/layout/wave-divider';

// docs/StyleGuide.md §5.7 (DESIGN-SPEC §1.4, §3.1): one Section per idea. Pages alternate the paper and the sunken
// paper; `night` and `forest` are the dark bands with the kawung texture; `brand` is the closing CTA band (forest,
// centred). A wave on top steps in from the tone above. Vertical rhythm: 56 px on phones, 80 at md, 112 from lg.
export type SectionTone = 'default' | 'muted' | 'night' | 'forest' | 'brand';
export type SectionAlign = 'left' | 'center';

// scroll-mt-header keeps an anchored section (/#kampung, /rw-05-ecowastreme#profil) clear of the sticky header.
// `relative` holds the section's wave.
const sectionVariants = cva('relative scroll-mt-header py-14 md:py-20 lg:py-28', {
  variants: {
    tone: {
      default: 'bg-background',
      muted: 'bg-muted',
      night: 'bg-night text-white kawung kawung-6',
      forest: 'bg-forest-night text-white kawung kawung-7',
      brand: 'bg-forest-night text-white kawung kawung-7 lg:pt-32 lg:pb-38',
    },
  },
});

// The colour a section's wave is painted in.
const WAVE_TONE_OF: Record<SectionTone, WaveTone> = {
  default: 'background',
  muted: 'muted',
  night: 'night',
  forest: 'forest',
  brand: 'forest',
};

// Tones whose heading turns gold and white (SectionHeading onDark).
const IS_DARK_TONE: Record<SectionTone, boolean> = {
  default: false,
  muted: false,
  night: true,
  forest: true,
  brand: true,
};

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
  return (
    <section id={id} aria-labelledby={labelledBy} className={sectionVariants({ tone })}>
      {wave ? <WaveDivider tone={WAVE_TONE_OF[tone]} {...wave} /> : null}
      <Container>{children}</Container>
      {bleed ? <div className="mt-10 md:mt-12">{bleed}</div> : null}
    </section>
  );
}

export interface SectionProps
  extends
    Pick<SectionShellProps, 'tone' | 'wave' | 'bleed'>,
    Pick<SectionHeadingProps, 'eyebrow' | 'description' | 'size'> {
  // Also the anchor other pages link to, such as /rw-05-ecowastreme#profil.
  id: string;
  title: string;
  align?: SectionAlign;
  // A section a header link points at (/#kampung): following the link moves the focus to its heading as well, so a
  // keyboard or screen-reader user goes on from there and not from the top of the page. The heading carries the id and
  // takes the focus rather than the whole section: Chrome centres a focused element taller than the window, which would
  // scroll the heading out of sight. It draws no ring of its own.
  isLinkTarget?: boolean;
  // The `see all` link, beside the heading from lg and under it below (`Semua paket wisata`).
  headerAction?: ReactNode;
  children?: ReactNode;
}

// The heading row: the heading with its action at the end, aligned to the heading's last line from lg (§3.1).
function HeadingRow({ heading, action }: { heading: ReactNode; action?: ReactNode }) {
  if (!action) return heading;
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      {heading}
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export function Section({
  id,
  title,
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
  const headingBlock = (
    <SectionHeading
      titleId={titleId}
      title={title}
      align={align}
      onDark={IS_DARK_TONE[tone]}
      anchorId={isLinkTarget ? id : undefined}
      {...heading}
    />
  );
  return (
    <SectionShell
      id={isLinkTarget ? undefined : id}
      labelledBy={titleId}
      tone={tone}
      wave={wave}
      bleed={bleed}
    >
      <div className="space-y-12 lg:space-y-14">
        <HeadingRow heading={headingBlock} action={headerAction} />
        {children}
      </div>
    </SectionShell>
  );
}
