'use client';

import { useState, type ReactNode } from 'react';

import {
  WizardSummaryBar,
  WizardSummaryPanel,
  type WizardSummaryProps,
} from '@/components/booking/wizard-summary';
import { Skeleton } from '@/components/ui/skeleton';
import type { BookingStep } from '@/config/site';
import { stepIndex } from '@/lib/utils/booking-wizard';
import { cn } from '@/lib/utils/cn';

// DESIGN-SPEC §1.4: the 1200 px container, 40 px in from md and 20 px on a phone.
export const WIZARD_CONTAINER = 'mx-auto w-full max-w-300 px-5 md:px-10 xl:px-0';

// DESIGN-SPEC §4 Wizard, step change: the new step slides in 16 px from the side it comes from and fades in, the
// container as one (fields never move on their own). Not on the first step shown, which is the page's content.
function useStepEntrance(step: BookingStep): string | undefined {
  const [shown, setShown] = useState<{ step: BookingStep; entrance?: string }>({ step });
  if (shown.step !== step) {
    setShown({
      step,
      entrance:
        stepIndex(step) > stepIndex(shown.step)
          ? 'motion-safe:slide-in-from-right-4'
          : 'motion-safe:slide-in-from-left-4',
    });
  }
  return shown.entrance;
}

export function StepEntrance({ step, children }: { step: BookingStep; children: ReactNode }) {
  const entrance = useStepEntrance(step);
  return (
    <div
      key={step}
      className={cn(
        entrance && 'motion-safe:animate-in motion-safe:duration-240 motion-safe:fade-in',
        entrance,
      )}
    >
      {children}
    </div>
  );
}

// DESIGN-SPEC §3.10: the step beside the 400 px summary, sticky from lg; below lg the summary is a bar under the
// progress. The summary waits for the draft, which the browser reads after the first paint.
export function WizardColumns({
  summary,
  children,
}: {
  summary: WizardSummaryProps | null;
  children: ReactNode;
}) {
  return (
    <>
      {summary && <WizardSummaryBar {...summary} />}
      <div
        className={cn(
          WIZARD_CONTAINER,
          'grid gap-12 pt-7 pb-32 md:pt-9 md:pb-24 lg:grid-cols-[minmax(0,1fr)_400px]',
        )}
      >
        <div className="min-w-0">{children}</div>
        {summary && (
          <aside className="max-lg:hidden">
            <WizardSummaryPanel {...summary} />
          </aside>
        )}
      </div>
    </>
  );
}

export function WizardSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <Skeleton className="h-10 w-2/3 rounded-md" />
      <Skeleton className="h-80 w-full rounded-2xl" />
    </div>
  );
}
