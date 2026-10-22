'use client';

import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy/id';
import type { BookingDraft } from '@/lib/utils/booking-wizard';
import type { WizardPackage } from '@/types/booking';

const text = copy.booking.wizard;

// What every step of the wizard gets from the shell (src/components/booking/wizard-shell.tsx).
export interface WizardStepProps {
  wizardPackage: WizardPackage;
  draft: BookingDraft;
  update: (change: Partial<BookingDraft>) => void;
  // To the next step, once this one's check passed.
  onDone: () => void;
  onBack: (() => void) | null;
}

export const STEP_HEADING_ID = 'wizard-step-heading';

export interface WizardStepFrameProps {
  title: string;
  description?: string;
  onBack: (() => void) | null;
  children: ReactNode;
  // The step's own buttons; Lanjut by default.
  actions?: ReactNode;
}

// One step: its heading, which the shell focuses when the step opens, its fields, and Kembali with the step's own
// forward button below them (docs/StyleGuide.md §5.14: every step can be sent with the keyboard).
export function WizardStepFrame({
  title,
  description,
  onBack,
  children,
  actions,
}: WizardStepFrameProps) {
  return (
    <section aria-labelledby={STEP_HEADING_ID} className="space-y-6">
      <header className="space-y-2">
        <h2 id={STEP_HEADING_ID} tabIndex={-1} className="text-h2 text-balance outline-none">
          {title}
        </h2>
        {description && (
          <p className="text-body-sm text-pretty text-muted-foreground">{description}</p>
        )}
      </header>
      {children}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {onBack ? (
          <Button type="button" variant="ghost" size="lg" onClick={onBack}>
            <ArrowLeft aria-hidden /> {text.back}
          </Button>
        ) : (
          <span aria-hidden />
        )}
        {actions ?? (
          <Button type="submit" size="lg">
            {text.next}
          </Button>
        )}
      </div>
    </section>
  );
}
