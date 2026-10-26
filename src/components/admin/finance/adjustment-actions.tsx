'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { RejectForm } from '@/components/admin/finance/reject-form';
import { CodeConfirmForm } from '@/components/admin/staff/change-forms';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { adjustmentsCopy } from '@/lib/copy/finance-adjustments';
import { formatDateTimeShort } from '@/lib/utils/dates';
import { withStepUp } from '@/lib/utils/step-up';
import type { ActionResult } from '@/types/action-result';
import type { Adjustment, AppliedAdjustment, ApplyOutcome } from '@/types/finance';

const text = adjustmentsCopy;

type IdAction = (values: unknown) => Promise<ActionResult<unknown>>;

export interface AdjustmentActionsProps {
  adjustment: Pick<Adjustment, 'id' | 'status' | 'applyNotBefore'>;
  // When the page was read, so "apply" waits for the 24-hour delay the database enforces anyway.
  nowIso: string;
  approveAction: IdAction;
  rejectAction: IdAction;
  applyAction: (values: unknown) => Promise<ActionResult<AppliedAdjustment>>;
  stepUpAction: (values: unknown) => Promise<ActionResult<null>>;
}

type Step = 'approve' | 'reject' | 'apply' | null;

// CodeConfirmForm answers only whether it worked; the adjustment's new state comes back with the page's refresh.
function withoutData(run: (values: unknown) => Promise<ActionResult<unknown>>) {
  return async (values: unknown): Promise<ActionResult<null>> => {
    const result = await run(values);
    return result.ok ? { ok: true, data: null } : result;
  };
}

function StepDialog({
  step,
  onClose,
  children,
}: {
  step: Exclude<Step, null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const titles = {
    approve: [text.approveTitle, text.approveDescription],
    reject: [text.rejectTitle, text.rejectDescription],
    apply: [text.applyTitle, text.applyDescription],
  } as const;
  const [title, description] = titles[step];
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={description}
      size="form"
    >
      {children}
    </ResponsiveDialog>
  );
}

function StepButtons({
  adjustment,
  nowIso,
  onStep,
}: Pick<AdjustmentActionsProps, 'adjustment' | 'nowIso'> & {
  onStep: (step: Exclude<Step, null>) => void;
}) {
  const waits = adjustment.applyNotBefore !== null && adjustment.applyNotBefore > nowIso;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {adjustment.status === 'proposed' ? (
        <Button
          type="button"
          size="sm"
          onClick={() => {
            onStep('approve');
          }}
        >
          {text.approve}
        </Button>
      ) : null}
      {adjustment.status === 'approved' ? (
        <Button
          type="button"
          size="sm"
          disabled={waits}
          onClick={() => {
            onStep('apply');
          }}
        >
          {text.apply}
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          onStep('reject');
        }}
      >
        {text.reject}
      </Button>
      {waits && adjustment.applyNotBefore ? (
        <p className="w-full text-right text-caption text-muted-foreground">
          {text.appliesFrom(formatDateTimeShort(adjustment.applyNotBefore))}
        </p>
      ) : null}
    </div>
  );
}

// "Terapkan": a transfer Midtrans overtook comes back rejected (ApplyOutcome 'overtaken'), which the superadmin is told
// in a warning that stays until read, with what to do about the visitor who may hold two refunds.
function ApplyDialog({
  adjustmentId,
  applyAction,
  stepUpAction,
  onClose,
  onApplied,
}: {
  adjustmentId: string;
  applyAction: AdjustmentActionsProps['applyAction'];
  stepUpAction: AdjustmentActionsProps['stepUpAction'];
  onClose: () => void;
  onApplied: () => void;
}) {
  const outcome = useRef<ApplyOutcome>('applied');
  const applyById = async () => {
    const result = await applyAction({ adjustmentId });
    if (result.ok) outcome.current = result.data.outcome;
    return result;
  };
  const done = () => {
    if (outcome.current === 'overtaken')
      toast.warning(text.overtaken, { duration: Infinity, closeButton: true });
    else toast.success(text.applied);
    onApplied();
  };
  return (
    <StepDialog step="apply" onClose={onClose}>
      <CodeConfirmForm
        submitLabel={text.apply}
        isDestructive={false}
        submit={withoutData(withStepUp(stepUpAction, applyById))}
        onDone={done}
      />
    </StepDialog>
  );
}

// Task P4.7.04: what an open adjustment can do next, each step behind the authenticator code (docs/Security.md §5.3).
export function AdjustmentActions({
  adjustment,
  nowIso,
  stepUpAction,
  ...actions
}: AdjustmentActionsProps) {
  const [step, setStep] = useState<Step>(null);
  const router = useRouter();
  if (adjustment.status !== 'proposed' && adjustment.status !== 'approved') return null;
  const close = () => {
    setStep(null);
  };
  const refreshAfter = () => {
    close();
    router.refresh();
  };
  const done = (message: string) => () => {
    toast.success(message);
    refreshAfter();
  };
  const byId = (action: IdAction) => () => action({ adjustmentId: adjustment.id });
  return (
    <>
      <StepButtons adjustment={adjustment} nowIso={nowIso} onStep={setStep} />
      {step === 'reject' ? (
        <StepDialog step="reject" onClose={close}>
          <RejectForm
            adjustmentId={adjustment.id}
            submit={withStepUp(stepUpAction, actions.rejectAction)}
            onDone={done(text.rejected)}
          />
        </StepDialog>
      ) : null}
      {step === 'approve' ? (
        <StepDialog step="approve" onClose={close}>
          <CodeConfirmForm
            submitLabel={text.approve}
            isDestructive={false}
            submit={withoutData(withStepUp(stepUpAction, byId(actions.approveAction)))}
            onDone={done(text.approved)}
          />
        </StepDialog>
      ) : null}
      {step === 'apply' ? (
        <ApplyDialog
          adjustmentId={adjustment.id}
          applyAction={actions.applyAction}
          stepUpAction={stepUpAction}
          onClose={close}
          onApplied={refreshAfter}
        />
      ) : null}
    </>
  );
}
