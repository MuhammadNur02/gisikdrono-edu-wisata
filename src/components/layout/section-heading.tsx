import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

// Section Heading of DESIGN-SPEC §2.6: an eyebrow row (a 28 x 2 rule and the eyebrow), the title, the description, at
// most 640 px wide. The rule and the eyebrow take the current RW (rw-scope-* on an ancestor; outside any RW they are
// the primary), gold on a dark band. The three parts reveal one after another as they come into view.
const headingVariants = cva('max-w-160 space-y-4 reveal-stagger', {
  variants: {
    align: { left: '', center: 'mx-auto text-center' },
  },
});

const TITLE_SIZE = {
  default: 'text-section-title',
  compact: 'text-section-title-compact',
} as const;

export interface SectionHeadingProps {
  titleId: string;
  title: string;
  eyebrow?: ReactNode;
  description?: string;
  align?: 'left' | 'center';
  // `compact` sets the title at 40 px, for a section that is not a chapter of its own (DESIGN-SPEC §1.3 h2).
  size?: keyof typeof TITLE_SIZE;
  // On night, forest and the CTA band: gold eyebrow, white title, light description.
  onDark?: boolean;
  // Set when the section is a link target: the heading carries the section's id and takes the focus.
  anchorId?: string;
  className?: string;
}

function Eyebrow({
  children,
  align,
  onDark,
}: {
  children: ReactNode;
  align: string;
  onDark: boolean;
}) {
  return (
    <p
      className={cn(
        'flex reveal items-center gap-3 text-eyebrow',
        align === 'center' && 'justify-center',
        onDark ? 'text-gold' : 'text-rw',
      )}
    >
      <span aria-hidden className={cn('h-0.5 w-7 shrink-0', onDark ? 'bg-gold' : 'bg-rw-fill')} />
      {children}
    </p>
  );
}

function Description({ text, onDark }: { text: string; onDark: boolean }) {
  return (
    <p className={cn('reveal text-body-lg text-pretty', onDark ? 'text-on-forest' : 'text-ink-2')}>
      {text}
    </p>
  );
}

export function SectionHeading({
  titleId,
  title,
  eyebrow,
  description,
  align = 'left',
  size = 'default',
  onDark = false,
  anchorId,
  className,
}: SectionHeadingProps) {
  return (
    <div
      id={anchorId}
      tabIndex={anchorId === undefined ? undefined : -1}
      className={cn(
        headingVariants({ align }),
        anchorId !== undefined && 'scroll-mt-header outline-none',
        className,
      )}
    >
      {eyebrow ? (
        <Eyebrow align={align} onDark={onDark}>
          {eyebrow}
        </Eyebrow>
      ) : null}
      <h2 id={titleId} className={cn(TITLE_SIZE[size], 'reveal text-balance')}>
        {title}
      </h2>
      {description ? <Description text={description} onDark={onDark} /> : null}
    </div>
  );
}
