'use client';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { BookingStepper } from '@/components/booking/booking-stepper';
import { STEP_HEADING_ID, type WizardStepProps } from '@/components/booking/wizard-step-frame';
import { FormAlert } from '@/components/forms/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { SESSION_REFRESH_MS } from '@/config/booking';
import { BOOKING_STEPS, type BookingStep } from '@/config/site';
import { useBookingDraft } from '@/hooks/use-booking-draft';
import { useQuotePreview, type QuotePreviewState } from '@/hooks/use-quote-preview';
import { copy } from '@/lib/copy/id';
import {
  firstIncompleteStep,
  isBookingStep,
  stepIndex,
  type BookingDraft,
} from '@/lib/utils/booking-wizard';
import { formatIDR } from '@/lib/utils/currency';
import type { WizardActions, WizardPackage } from '@/types/booking';
import type { AddonProduct } from '@/types/product';
import type { BookableLeg } from '@/types/session';

const text = copy.booking.wizard;

// docs/StyleGuide.md budgets, CLAUDE.md §5.1: each step is a chunk of its own (the calendar, the participant list, the
// code field), so the wizard's first load is the shell alone. The shell asks for all four once it is on screen, so
// going on to the next step waits for nothing.
const STEP_LOADERS = {
  jadwal: () =>
    import('@/components/booking/session-picker-step').then((module) => module.SessionPickerStep),
  data: () =>
    import('@/components/booking/booker-form-step').then((module) => module.BookerFormStep),
  tambahan: () => import('@/components/booking/addons-step').then((module) => module.AddonsStep),
  ringkasan: () => import('@/components/booking/summary-step').then((module) => module.SummaryStep),
} as const;

// next/dynamic reads its options as written, so each step spells them out.
const SessionPickerStep = dynamic(STEP_LOADERS.jadwal, {
  ssr: false,
  loading: () => <WizardSkeleton />,
});
const BookerFormStep = dynamic(STEP_LOADERS.data, {
  ssr: false,
  loading: () => <WizardSkeleton />,
});
const AddonsStep = dynamic(STEP_LOADERS.tambahan, {
  ssr: false,
  loading: () => <WizardSkeleton />,
});
const SummaryStep = dynamic(STEP_LOADERS.ringkasan, {
  ssr: false,
  loading: () => <WizardSkeleton />,
});

function usePreloadedSteps() {
  useEffect(() => {
    for (const load of Object.values(STEP_LOADERS)) void load();
  }, []);
}

export interface WizardShellProps {
  wizardPackage: WizardPackage;
  addons: AddonProduct[];
  initialLegs: BookableLeg[];
  actions: WizardActions;
}

// The step lives in the address (?step=), moved with the History API, which Next.js keeps in step with
// useSearchParams: going from step to step asks the server for nothing.
function useWizardStep() {
  const searchParams = useSearchParams();
  const raw = searchParams.get('step');
  const step: BookingStep = isBookingStep(raw) ? raw : 'jadwal';
  const open = (next: BookingStep, how: 'push' | 'replace' = 'push') => {
    const address = `?step=${next}`;
    if (how === 'push') window.history.pushState(null, '', address);
    else window.history.replaceState(null, '', address);
  };
  return { step, open };
}

// docs/PRD.md FR-BOOK-02: the seats left, read again through the server every 15 s while the visitor chooses.
function useLiveSessions(
  actions: WizardActions,
  packageSlug: string,
  initialLegs: BookableLeg[],
  isActive: boolean,
) {
  const [legs, setLegs] = useState(initialLegs);
  useEffect(() => {
    if (!isActive) return undefined;
    const read = () => {
      void actions.listSessions({ packageSlug }).then((result) => {
        if (result.ok) setLegs(result.data);
      });
    };
    read();
    const timer = setInterval(read, SESSION_REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [actions, packageSlug, isActive]);
  return legs;
}

// Each step opens with its heading in focus and at the top of the page, so the keyboard and the screen reader start
// where the eye does (docs/StyleGuide.md §5.14, A13).
function useStepFocus(step: BookingStep) {
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    window.scrollTo({ top: 0 });
    document.getElementById(STEP_HEADING_ID)?.focus();
  }, [step]);
}

function TotalBar({ preview }: { preview: QuotePreviewState }) {
  if (preview.status !== 'ready' || preview.answer.kind !== 'quote') return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
      <p className="text-body font-semibold tabular-nums">
        {text.quote.totalShort(formatIDR(preview.answer.quote.total))}
      </p>
    </div>
  );
}

function WizardSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

// Everything the steps share: the draft, the step in the address, the seats left, the quote, and the booking made.
function useWizardFlow({ wizardPackage, initialLegs, actions }: WizardShellProps) {
  const router = useRouter();
  const { draft, update, clear } = useBookingDraft(wizardPackage);
  const { step, open } = useWizardStep();
  const [bookedUrl, setBookedUrl] = useState<string | null>(null);
  const legs = useLiveSessions(actions, wizardPackage.slug, initialLegs, step === 'jadwal');
  const pricesNow = draft !== null && (step === 'tambahan' || step === 'ringkasan');
  const quote = useQuotePreview(
    actions.previewQuote,
    pricesNow ? { packageSlug: wizardPackage.slug, pax: draft.pax, addons: draft.addons } : null,
  );
  const reachable = draft ? firstIncompleteStep(draft, wizardPackage) : 'jadwal';
  useStepFocus(step);
  usePreloadedSteps();
  useEffect(() => {
    if (draft && bookedUrl === null && stepIndex(step) > stepIndex(reachable))
      open(reachable, 'replace');
  });
  // The draft goes once the booking is made, and the browser opens the booking's next page (decision on P3.5, Q1).
  const onBooked = (nextUrl: string) => {
    setBookedUrl(nextUrl);
    clear();
    router.push(nextUrl);
  };
  return { draft, update, step, open, legs, quote, reachable, bookedUrl, onBooked };
}

type WizardFlow = ReturnType<typeof useWizardFlow>;

function stepPropsOf(
  flow: WizardFlow,
  wizardPackage: WizardPackage,
  draft: BookingDraft,
): WizardStepProps {
  const index = stepIndex(flow.step);
  const previous = BOOKING_STEPS[index - 1];
  const next = BOOKING_STEPS[index + 1];
  return {
    wizardPackage,
    draft,
    update: flow.update,
    onDone: () => {
      if (next) flow.open(next);
    },
    onBack: previous
      ? () => {
          flow.open(previous);
        }
      : null,
  };
}

function CurrentStep(props: WizardShellProps & { flow: WizardFlow; draft: BookingDraft }) {
  const { flow, draft, wizardPackage, addons, actions } = props;
  const stepProps = stepPropsOf(flow, wizardPackage, draft);
  const openStep = (target: BookingStep) => {
    flow.open(target);
  };
  if (flow.step === 'jadwal') return <SessionPickerStep {...stepProps} legs={flow.legs} />;
  if (flow.step === 'data') return <BookerFormStep {...stepProps} actions={actions} />;
  if (flow.step === 'tambahan') {
    return <AddonsStep {...stepProps} addons={addons} preview={flow.quote.state} />;
  }
  return (
    <SummaryStep
      {...stepProps}
      actions={actions}
      legs={flow.legs}
      preview={flow.quote.state}
      refreshPreview={flow.quote.refresh}
      onOpen={openStep}
      onBooked={flow.onBooked}
    />
  );
}

// docs/PRD.md FR-BOOK-01, docs/StyleGuide.md §5.14 (Task P3.5.01): the four steps over one draft. The visitor may go
// back at any time; an address that skips a step whose check fails is sent back to it.
export function WizardShell(props: WizardShellProps) {
  const flow = useWizardFlow(props);
  if (flow.bookedUrl !== null) return <FormAlert tone="info">{text.summary.redirecting}</FormAlert>;
  if (flow.draft === null) return <WizardSkeleton />;
  const index = stepIndex(flow.step);
  const invalid = BOOKING_STEPS.filter(
    (each) => stepIndex(each) >= stepIndex(flow.reachable) && stepIndex(each) < index,
  );
  return (
    <div className="space-y-8 pb-20 md:pb-0">
      <BookingStepper
        current={flow.step}
        reachable={flow.reachable}
        invalid={invalid}
        onOpen={(target) => {
          flow.open(target);
        }}
      />
      <CurrentStep {...props} flow={flow} draft={flow.draft} />
      {(flow.step === 'tambahan' || flow.step === 'ringkasan') && (
        <TotalBar preview={flow.quote.state} />
      )}
    </div>
  );
}
