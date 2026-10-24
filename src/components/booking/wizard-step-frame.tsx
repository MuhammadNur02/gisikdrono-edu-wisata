'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { bookingLayoutCopy } from '@/lib/copy/booking-layout';
import { copy } from '@/lib/copy/id';
import type { BookingDraft } from '@/lib/utils/booking-wizard';
import { cn } from '@/lib/utils/cn';
import type { WizardPackage } from '@/types/booking';

const text = copy.booking.wizard;
const layout = bookingLayoutCopy.wizard;

// What every step of the wizard gets from the shell (src/components/booking/wizard-shell.tsx).
export interface WizardStepProps {
  wizardPackage: WizardPackage;
  draft: BookingDraft;
  update: (change: Partial<BookingDraft>) => void;
  // To the next step, once this one's check passed.
  onDone: () => void;
  onBack: (() => void) | null;
  // The names of the steps around this one, for "Kembali ke data" and "Lanjut ke tambahan".
  backLabel: string | null;
  nextLabel: string | null;
}

export const STEP_HEADING_ID = 'wizard-step-heading';

export interface WizardStepFrameProps {
  title: string;
  description?: string;
  onBack: (() => void) | null;
  backLabel: string | null;
  // Where the first step's back link goes: the package page.
  exitHref?: string;
  children: ReactNode;
  // The step's own forward button; "Lanjut ke …" by default.
  actions?: ReactNode;
  nextLabel?: string | null;
}

// DESIGN-SPEC §3.10: a panel of the wizard, paper-white on the page, radius 20, 28 px in (20 on a phone).
export function WizardPanel({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'space-y-5 rounded-2xl border border-border bg-card p-5 md:space-y-6 md:p-7',
        className,
      )}
    >
      {title ? <h3 className="text-h4 font-bold">{title}</h3> : null}
      {children}
    </div>
  );
}

const BACK_CLASS =
  'max-md:size-13 max-md:border-control max-md:border-foreground max-md:px-0 md:-ml-3 md:px-3';

function BackControl({
  onBack,
  backLabel,
  exitHref,
}: Pick<WizardStepFrameProps, 'onBack' | 'backLabel' | 'exitHref'>) {
  const content = (
    <>
      <ArrowLeft aria-hidden />
      <span className="max-md:sr-only">
        {onBack ? (backLabel ? layout.backTo(backLabel) : text.back) : layout.backToPackage}
      </span>
    </>
  );
  if (onBack) {
    return (
      <Button type="button" variant="ghost" size="lg" className={BACK_CLASS} onClick={onBack}>
        {content}
      </Button>
    );
  }
  if (!exitHref) return <span aria-hidden />;
  return (
    <Button asChild variant="ghost" size="lg" className={BACK_CLASS}>
      <Link href={exitHref}>{content}</Link>
    </Button>
  );
}

// The navigation row: back on the left, the step's primary on the right. On a phone the same row is the fixed action
// bar at the bottom of the screen (DESIGN-SPEC §2.10 Mobile action bar), so each control exists once.
function StepNavigation(props: Omit<WizardStepFrameProps, 'title' | 'description' | 'children'>) {
  const { actions, nextLabel } = props;
  return (
    <div className="flex items-center gap-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:min-h-20 max-md:border-t max-md:border-border max-md:bg-card/96 max-md:px-5 max-md:py-3.5 max-md:shadow-bar max-md:backdrop-blur-lg md:justify-between md:pt-2">
      <BackControl {...props} />
      <div className="flex flex-1 justify-end gap-3 max-md:*:flex-1 md:flex-none">
        {actions ?? (
          <Button type="submit" size="lg">
            {nextLabel ? layout.nextTo(nextLabel) : text.next}
            <ArrowRight aria-hidden data-icon="trailing" />
          </Button>
        )}
      </div>
    </div>
  );
}

// One step: its heading, which the shell focuses when the step opens, its panels, and the navigation row below them
// (docs/StyleGuide.md §5.14: every step can be sent with the keyboard). Fields never animate (DESIGN-SPEC §4).
export function WizardStepFrame({
  title,
  description,
  children,
  ...navigation
}: WizardStepFrameProps) {
  return (
    <section aria-labelledby={STEP_HEADING_ID} className="space-y-6 md:space-y-7">
      <header className="space-y-2.5">
        <h2
          id={STEP_HEADING_ID}
          tabIndex={-1}
          className="text-h2 text-balance outline-none md:text-h1"
        >
          {title}
        </h2>
        {description && <p className="max-w-180 text-body text-pretty text-ink-2">{description}</p>}
      </header>
      <div className="space-y-5 md:space-y-6">{children}</div>
      <StepNavigation {...navigation} />
    </section>
  );
}
