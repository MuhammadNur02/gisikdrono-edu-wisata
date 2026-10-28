'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import type { PreviewAction } from '@/components/admin/bookings/cancel-booking-form';
import { ResponsiveSheet } from '@/components/admin/shell/responsive-sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { bookingStaffCopy } from '@/lib/copy/booking-staff';
import type { ActionResult } from '@/types/action-result';
import type { ReviewLeg } from '@/types/booking-staff';

const text = bookingStaffCopy;

const CancelBookingForm = dynamic(() =>
  import('@/components/admin/bookings/cancel-booking-form').then(
    (module) => module.CancelBookingForm,
  ),
);
const ResolveReviewForm = dynamic(() =>
  import('@/components/admin/bookings/resolve-review-form').then(
    (module) => module.ResolveReviewForm,
  ),
);
const ExtendHoldForm = dynamic(() =>
  import('@/components/admin/bookings/hold-and-message-forms').then(
    (module) => module.ExtendHoldForm,
  ),
);
const ResendMessageForm = dynamic(() =>
  import('@/components/admin/bookings/hold-and-message-forms').then(
    (module) => module.ResendMessageForm,
  ),
);

type StepAction = (input: unknown) => Promise<ActionResult<null>>;

// What the page decides the staff member may do now (Task P4.3.08); each RPC decides again.
export interface StaffActionsProps {
  booking: { id: string; code: string; isPaid: boolean };
  can: {
    cancel: boolean;
    extend: boolean;
    reactivate: boolean;
    resend: boolean;
    resolveReview: boolean;
  };
  reviewLegs: ReviewLeg[];
  actions: {
    cancel: StepAction;
    preview: PreviewAction;
    extend: StepAction;
    reactivate: StepAction;
    resend: StepAction;
    resolveReview: StepAction;
    stepUp: StepAction;
  };
}

type Step = 'cancel' | 'extend' | 'resend' | 'review';

function useStaffStep() {
  const router = useRouter();
  const [step, setStep] = useState<Step | null>(null);
  const done = (message: string) => {
    toast.success(message);
    setStep(null);
    router.refresh();
  };
  return { step, setStep, done };
}

function StepButton(props: { label: string; onClick: () => void; isDestructive?: boolean }) {
  return (
    <Button
      type="button"
      variant={props.isDestructive ? 'destructive' : 'outline'}
      className="min-h-11 w-full"
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  );
}

function ReactivateButton({ bookingId, action }: { bookingId: string; action: StepAction }) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const reactivate = async () => {
    setIsBusy(true);
    const result = await action({ bookingId });
    setIsBusy(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(text.reactivate.done);
    router.refresh();
  };
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 w-full"
      loading={isBusy}
      onClick={() => void reactivate()}
    >
      {text.reactivate.submit}
    </Button>
  );
}

function StepSheet(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <ResponsiveSheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      title={props.title}
    >
      {props.children}
    </ResponsiveSheet>
  );
}

type StaffStep = ReturnType<typeof useStaffStep>;

const SHEET_STEPS: readonly {
  step: Step;
  flag: keyof StaffActionsProps['can'];
  label: string;
  isDestructive?: boolean;
}[] = [
  { step: 'review', flag: 'resolveReview', label: text.review.open },
  { step: 'extend', flag: 'extend', label: text.extend.open },
  { step: 'resend', flag: 'resend', label: text.resend.open },
  { step: 'cancel', flag: 'cancel', label: text.cancel.open, isDestructive: true },
];

function StepButtons({
  booking,
  can,
  actions,
  setStep,
}: StaffActionsProps & Pick<StaffStep, 'setStep'>) {
  return (
    <CardContent className="flex flex-col gap-2">
      {SHEET_STEPS.filter((entry) => can[entry.flag]).map((entry) => (
        <StepButton
          key={entry.step}
          label={entry.label}
          isDestructive={entry.isDestructive}
          onClick={() => {
            setStep(entry.step);
          }}
        />
      ))}
      {can.reactivate ? (
        <ReactivateButton bookingId={booking.id} action={actions.reactivate} />
      ) : null}
    </CardContent>
  );
}

function MoneySheets({
  booking,
  reviewLegs,
  actions,
  step,
  setStep,
  done,
}: StaffActionsProps & StaffStep) {
  const close = () => {
    setStep(null);
  };
  return (
    <>
      <StepSheet open={step === 'cancel'} title={text.cancel.title(booking.code)} onClose={close}>
        <CancelBookingForm
          bookingId={booking.id}
          isPaid={booking.isPaid}
          action={actions.cancel}
          stepUpAction={actions.stepUp}
          previewAction={actions.preview}
          onDone={() => {
            done(text.cancel.done);
          }}
        />
      </StepSheet>
      <StepSheet open={step === 'review'} title={text.review.title(booking.code)} onClose={close}>
        <ResolveReviewForm
          bookingId={booking.id}
          legs={reviewLegs}
          action={actions.resolveReview}
          stepUpAction={actions.stepUp}
          onDone={() => {
            done(text.review.done);
          }}
        />
      </StepSheet>
    </>
  );
}

function HoldSheets({ booking, actions, step, setStep, done }: StaffActionsProps & StaffStep) {
  const close = () => {
    setStep(null);
  };
  return (
    <>
      <StepSheet open={step === 'extend'} title={text.extend.title} onClose={close}>
        <ExtendHoldForm
          bookingId={booking.id}
          action={actions.extend}
          onDone={() => {
            done(text.extend.done);
          }}
        />
      </StepSheet>
      <StepSheet open={step === 'resend'} title={text.resend.title} onClose={close}>
        <ResendMessageForm
          bookingId={booking.id}
          action={actions.resend}
          onDone={() => {
            done(text.resend.done);
          }}
        />
      </StepSheet>
    </>
  );
}

export function StaffActions(props: StaffActionsProps) {
  const staffStep = useStaffStep();
  if (!Object.values(props.can).some(Boolean)) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      <StepButtons {...props} setStep={staffStep.setStep} />
      <MoneySheets {...props} {...staffStep} />
      <HoldSheets {...props} {...staffStep} />
    </Card>
  );
}
