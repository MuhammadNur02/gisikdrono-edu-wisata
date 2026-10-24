'use client';

import type { ReactNode } from 'react';

import {
  WizardSummaryBar,
  WizardSummaryPanel,
  type WizardSummaryProps,
} from '@/components/booking/wizard-summary';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';

// DESIGN-SPEC §1.4: the 1200 px container, 40 px in from md and 20 px on a phone.
export const WIZARD_CONTAINER = 'mx-auto w-full max-w-300 px-5 md:px-10 xl:px-0';

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
      <div className={cn(WIZARD_CONTAINER, 'flex gap-12 pt-7 pb-32 md:pt-9 md:pb-24')}>
        <div className="min-w-0 flex-1">{children}</div>
        {summary && (
          <aside className="w-100 shrink-0 max-lg:hidden">
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
