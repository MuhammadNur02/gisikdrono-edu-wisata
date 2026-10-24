'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { BookingStepper } from '@/components/booking/booking-stepper';
import {
  WIZARD_CONTAINER,
  WizardColumns,
  WizardSkeleton,
} from '@/components/booking/wizard-layout';
import { STEP_HEADING_ID, type WizardStepProps } from '@/components/booking/wizard-step-frame';
import { FormAlert } from '@/components/forms/form-alert';
import { SESSION_REFRESH_MS } from '@/config/booking';
import { GUEST_LOOKUP_PATH } from '@/config/guest';
import { BOOKING_STEPS, type BookingStep } from '@/config/site';
import { useBookingDraft } from '@/hooks/use-booking-draft';
import { useQuotePreview } from '@/hooks/use-quote-preview';
import { copy } from '@/lib/copy/id';
import {
  firstIncompleteStep,
  isBookingStep,
  stepIndex,
  type BookingDraft,
} from '@/lib/utils/booking-wizard';
import { cn } from '@/lib/utils/cn';
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
  // The head of the summary beside the steps, drawn on the server (wizard-package-card.tsx).
  packageCard: ReactNode;
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

// docs/PRD.md FR-BOOK-02: the seats left, read again through the server every 15 s while the visitor chooses. A read
// that is refused (the per-IP limit) or fails leaves the last seats on screen, marked as perhaps out of date (review
// of PR #27, L7).
function useLiveSessions(
  actions: WizardActions,
  packageSlug: string,
  initialLegs: BookableLeg[],
  isActive: boolean,
) {
  const [legs, setLegs] = useState(initialLegs);
  const [isStale, setIsStale] = useState(false);
  useEffect(() => {
    if (!isActive) return undefined;
    const read = () => {
      actions.listSessions({ packageSlug }).then(
        (result) => {
          if (result.ok) setLegs(result.data);
          setIsStale(!result.ok);
        },
        () => {
          setIsStale(true);
        },
      );
    };
    read();
    const timer = setInterval(read, SESSION_REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [actions, packageSlug, isActive]);
  return { legs, isStale };
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

// Review of PR #27, L5: the visitor already holds an unpaid hold for this, whose link just went to them again, so the
// draft is gone and the wizard says so instead of a step.
function ResentPanel() {
  return (
    <FormAlert tone="info">
      <p className="font-medium">{text.summary.resentTitle}</p>
      <p className="mt-1">{text.summary.resent}</p>
      <p className="mt-2">
        <Link href={GUEST_LOOKUP_PATH} className="text-primary-text underline underline-offset-4">
          {text.summary.resentLookup}
        </Link>
      </p>
    </FormAlert>
  );
}

// How the wizard ends, the draft gone either way: a booking made, whose next page the browser opens (decision on
// P3.5, Q1), or a hold the visitor already had, whose link went to them again (review of PR #27, L5).
function useWizardEnding(clear: () => void) {
  const router = useRouter();
  const [bookedUrl, setBookedUrl] = useState<string | null>(null);
  const [isResent, setIsResent] = useState(false);
  const onBooked = (nextUrl: string) => {
    setBookedUrl(nextUrl);
    clear();
    router.push(nextUrl);
  };
  const onResent = () => {
    setIsResent(true);
    clear();
  };
  return { bookedUrl, isResent, isFinished: bookedUrl !== null || isResent, onBooked, onResent };
}

// Everything the steps share: the draft, the step in the address, the seats left, the quote, and the booking made.
function useWizardFlow({ wizardPackage, initialLegs, actions }: WizardShellProps) {
  const { draft, update, clear } = useBookingDraft(wizardPackage);
  const { step, open } = useWizardStep();
  const ending = useWizardEnding(clear);
  const sessions = useLiveSessions(actions, wizardPackage.slug, initialLegs, step === 'jadwal');
  const pricesNow = draft !== null && (step === 'tambahan' || step === 'ringkasan');
  const quote = useQuotePreview(
    actions.previewQuote,
    pricesNow ? { packageSlug: wizardPackage.slug, pax: draft.pax, addons: draft.addons } : null,
  );
  const reachable = draft ? firstIncompleteStep(draft, wizardPackage) : 'jadwal';
  useStepFocus(step);
  usePreloadedSteps();
  useEffect(() => {
    if (draft && !ending.isFinished && stepIndex(step) > stepIndex(reachable)) {
      open(reachable, 'replace');
    }
  });
  return { ...ending, draft, update, step, open, sessions, quote, reachable };
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
    backLabel: previous ? text.steps[previous] : null,
    nextLabel: next ? text.steps[next] : null,
  };
}

function CurrentStep(props: WizardShellProps & { flow: WizardFlow; draft: BookingDraft }) {
  const { flow, draft, wizardPackage, addons, actions } = props;
  const stepProps = stepPropsOf(flow, wizardPackage, draft);
  const openStep = (target: BookingStep) => {
    flow.open(target);
  };
  if (flow.step === 'jadwal') {
    return (
      <SessionPickerStep {...stepProps} legs={flow.sessions.legs} isStale={flow.sessions.isStale} />
    );
  }
  if (flow.step === 'data') return <BookerFormStep {...stepProps} actions={actions} />;
  if (flow.step === 'tambahan') {
    return <AddonsStep {...stepProps} addons={addons} preview={flow.quote.state} />;
  }
  return (
    <SummaryStep
      {...stepProps}
      actions={actions}
      legs={flow.sessions.legs}
      preview={flow.quote.state}
      refreshPreview={flow.quote.refresh}
      onOpen={openStep}
      onBooked={flow.onBooked}
      onResent={flow.onResent}
    />
  );
}

// docs/PRD.md FR-BOOK-01, docs/StyleGuide.md §5.14 (Task P3.5.01): the four steps over one draft. The visitor may go
// back at any time; an address that skips a step whose check fails is sent back to it. DESIGN-SPEC §3.10: the progress
// on top, then the step beside the sticky summary (a bar under the progress below lg).
export function WizardShell(props: WizardShellProps) {
  const flow = useWizardFlow(props);
  const index = stepIndex(flow.step);
  const invalid = BOOKING_STEPS.filter(
    (each) => stepIndex(each) >= stepIndex(flow.reachable) && stepIndex(each) < index,
  );
  const summary = flow.draft && {
    wizardPackage: props.wizardPackage,
    packageCard: props.packageCard,
    draft: flow.draft,
    legs: flow.sessions.legs,
    preview: flow.quote.state,
    isFinal: flow.step === 'ringkasan',
  };
  return (
    <>
      <div className="border-b border-border py-3.5 md:border-0 md:py-0">
        <div className={cn(WIZARD_CONTAINER, 'md:pt-9')}>
          <BookingStepper
            current={flow.step}
            reachable={flow.reachable}
            invalid={invalid}
            onOpen={(target) => {
              flow.open(target);
            }}
          />
        </div>
      </div>
      <WizardColumns summary={summary}>
        <WizardBody flow={flow} props={props} />
      </WizardColumns>
    </>
  );
}

function WizardBody({ flow, props }: { flow: WizardFlow; props: WizardShellProps }) {
  if (flow.bookedUrl !== null) return <FormAlert tone="info">{text.summary.redirecting}</FormAlert>;
  if (flow.isResent) return <ResentPanel />;
  if (flow.draft === null) return <WizardSkeleton />;
  return <CurrentStep {...props} flow={flow} draft={flow.draft} />;
}
