import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { Container } from '@/components/layout/container';
import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §5.7: one Section per idea, default and muted alternating; `brand` is the CTA band.
export type SectionTone = 'default' | 'muted' | 'brand';
export type SectionAlign = 'left' | 'center';

// scroll-mt-17 keeps an anchored section (/#kampung, /rw-05-ecowastreme#profil) clear of the sticky header: its h-16
// plus the 1 px border below it.
const sectionVariants = cva('scroll-mt-17 py-16 md:py-24', {
  variants: {
    tone: { default: 'bg-background', muted: 'bg-muted/40', brand: 'bg-background' },
  },
});

const headingVariants = cva('max-w-3xl space-y-3', {
  variants: { align: { left: '', center: 'mx-auto text-center' } },
});

export interface SectionProps {
  // Also the anchor other pages link to, such as /rw-05-ecowastreme#profil.
  id: string;
  title: string;
  eyebrow?: ReactNode;
  description?: string;
  tone?: SectionTone;
  align?: SectionAlign;
  // A section a header link points at (/#kampung): following the link moves the focus to its heading as well, so a
  // keyboard or screen-reader user goes on from there and not from the top of the page. The heading carries the id and
  // takes the focus rather than the whole section: Chrome centres a focused element taller than the window, which would
  // scroll the heading out of sight. It draws no ring of its own.
  isLinkTarget?: boolean;
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

// The only decorative pattern the site allows (docs/StyleGuide.md §1.3 G2, §8.5), at 6 % opacity.
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

export function Section({
  id,
  tone = 'default',
  align = 'left',
  isLinkTarget = false,
  children,
  ...heading
}: SectionProps) {
  const titleId = `${id}-judul`;
  const isOnBrand = tone === 'brand';
  const body = (
    <div className="relative space-y-10">
      <SectionHeading
        titleId={titleId}
        align={align}
        isOnBrand={isOnBrand}
        anchorId={isLinkTarget ? id : undefined}
        {...heading}
      />
      {children}
    </div>
  );
  return (
    <section
      id={isLinkTarget ? undefined : id}
      aria-labelledby={titleId}
      className={sectionVariants({ tone })}
    >
      <Container>{isOnBrand ? <BrandPanel id={id}>{body}</BrandPanel> : body}</Container>
    </section>
  );
}
