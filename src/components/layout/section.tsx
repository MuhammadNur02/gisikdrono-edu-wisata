import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { Container } from '@/components/layout/container';
import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §5.7: one Section per idea, default and muted alternating; `brand` is the CTA band.
export type SectionTone = 'default' | 'muted' | 'brand';
export type SectionAlign = 'left' | 'center';

const sectionVariants = cva('py-16 md:py-24', {
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
  children?: ReactNode;
}

interface SectionHeadingProps {
  titleId: string;
  title: string;
  eyebrow?: ReactNode;
  description?: string;
  align: SectionAlign;
  isOnBrand: boolean;
}

function SectionHeading({
  titleId,
  title,
  eyebrow,
  description,
  align,
  isOnBrand,
}: SectionHeadingProps) {
  return (
    <div className={headingVariants({ align })}>
      {eyebrow ? (
        <p className={cn('text-overline', isOnBrand ? 'text-brand-ice' : 'text-primary')}>
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

export function Section({
  id,
  tone = 'default',
  align = 'left',
  children,
  ...heading
}: SectionProps) {
  const titleId = `${id}-judul`;
  const isOnBrand = tone === 'brand';
  const body = (
    <div className="relative space-y-10">
      <SectionHeading titleId={titleId} align={align} isOnBrand={isOnBrand} {...heading} />
      {children}
    </div>
  );
  return (
    <section id={id} aria-labelledby={titleId} className={sectionVariants({ tone })}>
      <Container>
        {isOnBrand ? (
          <div className="relative overflow-hidden rounded-2xl bg-brand-deep px-6 py-12 text-white md:px-12 md:py-16">
            <DotGrid patternId={`${id}-titik`} />
            {body}
          </div>
        ) : (
          body
        )}
      </Container>
    </section>
  );
}
