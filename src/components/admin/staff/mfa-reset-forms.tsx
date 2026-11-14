'use client';

import { Copy } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { CodeConfirmForm } from '@/components/admin/staff/code-confirm-form';
import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { staffCopy } from '@/lib/copy/staff';
import { formatDateTimeShort } from '@/lib/utils/dates';
import { formatStaffCode } from '@/lib/utils/staff-code-format';
import { withStepUp } from '@/lib/utils/step-up';
import type { ActionResult } from '@/types/action-result';
import type { IssuedReenrolmentCode, StaffMember, StaffRoleChange } from '@/types/staff';

// Task P4.8.05 (docs/Security.md §5.2, R24): the MFA reset's steps in the staff change dialog, each behind the
// authenticator code, and the re-enrolment code shown once.

type FormAction<TData> = (values: unknown) => Promise<ActionResult<TData>>;

export interface MfaResetActions {
  stepUpAction: FormAction<null>;
  resetMfaAction: FormAction<StaffRoleChange>;
  cancelMfaResetAction: FormAction<null>;
  issueReenrolmentCodeAction: FormAction<IssuedReenrolmentCode>;
}

function resetMessage(change: StaffRoleChange): string {
  return change.stage === 'requested'
    ? staffCopy.mfaReset.requested(formatDateTimeShort(change.completesAfter))
    : staffCopy.mfaReset.completed;
}

// The first call asks for the reset and the same call 24 hours later completes it; reset_staff_mfa decides which.
export function MfaResetBody({
  member,
  actions,
  finish,
}: {
  member: StaffMember;
  actions: MfaResetActions;
  finish: (message: string | null) => void;
}) {
  const text = staffCopy.mfaReset;
  // Kept across the renders between the answer and onDone.
  const message = useRef<string | null>(null);
  const reset = async (): Promise<ActionResult<null>> => {
    const result = await actions.resetMfaAction({ userId: member.id });
    if (!result.ok) return result;
    message.current = resetMessage(result.data);
    return { ok: true, data: null };
  };
  return (
    <CodeConfirmForm
      submitLabel={member.mfaResetRequestedAt ? text.completeSubmit : text.submit}
      submit={withStepUp(actions.stepUpAction, reset)}
      onDone={() => {
        finish(message.current);
      }}
    />
  );
}

export function CancelMfaResetBody({
  member,
  actions,
  finish,
}: {
  member: StaffMember;
  actions: MfaResetActions;
  finish: (message: string | null) => void;
}) {
  return (
    <CodeConfirmForm
      submitLabel={staffCopy.mfaReset.cancelSubmit}
      isDestructive={false}
      submit={withStepUp(actions.stepUpAction, () =>
        actions.cancelMfaResetAction({ userId: member.id }),
      )}
      onDone={() => {
        finish(staffCopy.mfaReset.cancelled);
      }}
    />
  );
}

// docs/Security.md §5.1, as an invite code: on screen only until the dialog closes, read out in groups of five.
function IssuedCodeCard({ issued, onDone }: { issued: IssuedReenrolmentCode; onDone: () => void }) {
  const text = staffCopy.reenrolment;
  const copyCode = () => {
    navigator.clipboard.writeText(issued.code).then(
      () => toast.success(staffCopy.invite.copied),
      () => undefined,
    );
  };
  return (
    <div className="space-y-4">
      <FormAlert tone="info">{text.codeWarning}</FormAlert>
      <p className="text-body-sm font-medium">{text.codeTitle}</p>
      <p className="rounded-lg border border-border bg-muted px-4 py-3 text-center text-h4 font-mono tracking-widest break-all select-all">
        <span aria-hidden>{formatStaffCode(issued.code)}</span>
        <span className="sr-only">{`${text.codeLabel}: ${issued.code.split('').join(' ')}`}</span>
      </p>
      <Button type="button" variant="outline" className="w-full" onClick={copyCode}>
        <Copy aria-hidden />
        {staffCopy.invite.copy}
      </Button>
      <p className="text-body-sm">{text.expiresAt(formatDateTimeShort(issued.expiresAt))}</p>
      <Button type="button" size="lg" className="w-full" onClick={onDone}>
        {text.done}
      </Button>
    </div>
  );
}

export function ReenrolmentCodeBody({
  member,
  actions,
  finish,
}: {
  member: StaffMember;
  actions: MfaResetActions;
  finish: (message: string | null) => void;
}) {
  const [issued, setIssued] = useState<IssuedReenrolmentCode | null>(null);
  const issue = async (): Promise<ActionResult<null>> => {
    const result = await actions.issueReenrolmentCodeAction({ userId: member.id });
    if (!result.ok) return result;
    setIssued(result.data);
    return { ok: true, data: null };
  };
  if (issued) {
    return (
      <IssuedCodeCard
        issued={issued}
        onDone={() => {
          finish(null);
        }}
      />
    );
  }
  return (
    <CodeConfirmForm
      submitLabel={staffCopy.reenrolment.submit}
      isDestructive={false}
      submit={withStepUp(actions.stepUpAction, issue)}
      onDone={() => undefined}
    />
  );
}
