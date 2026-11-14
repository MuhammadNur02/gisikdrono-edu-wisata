'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { RoleChangeForm, StatusChangeForm } from '@/components/admin/staff/change-forms';
import { CodeConfirmForm } from '@/components/admin/staff/code-confirm-form';
import {
  CancelMfaResetBody,
  MfaResetBody,
  ReenrolmentCodeBody,
  type MfaResetActions,
} from '@/components/admin/staff/mfa-reset-forms';
import type { RwOption } from '@/components/admin/staff/role-select';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { staffCopy } from '@/lib/copy/staff';
import { formatDateTimeShort } from '@/lib/utils/dates';
import { withStepUp } from '@/lib/utils/step-up';
import type { ActionResult } from '@/types/action-result';
import type {
  StaffInviteSummary,
  StaffMember,
  StaffRoleChange,
  StaffStatusChange,
} from '@/types/staff';

type FormAction<TData> = (values: unknown) => Promise<ActionResult<TData>>;

export interface StaffChangeActions extends MfaResetActions {
  setRoleAction: FormAction<StaffRoleChange>;
  setStatusAction: FormAction<StaffStatusChange>;
  cancelPromotionAction: FormAction<null>;
  revokeInviteAction: FormAction<null>;
}

type MfaKind = 'mfaReset' | 'cancelMfaReset' | 'reenrolmentCode';

export type StaffChangeRequest =
  | { kind: 'role' | 'status' | 'cancelPromotion' | MfaKind; member: StaffMember }
  | { kind: 'revokeInvite'; invite: StaffInviteSummary };

export interface StaffChangeDialogProps {
  request: StaffChangeRequest;
  rwUnits: readonly RwOption[];
  actions: StaffChangeActions;
  onClose: () => void;
}

function mfaResetHeading(
  kind: 'mfaReset' | 'cancelMfaReset',
  member: StaffMember,
): { title: string; description: string } {
  const text = staffCopy.mfaReset;
  if (kind === 'cancelMfaReset') {
    return { title: text.cancelTitle(member.fullName), description: text.cancelDescription };
  }
  return member.mfaResetRequestedAt
    ? { title: text.completeTitle(member.fullName), description: text.completeDescription }
    : { title: text.title(member.fullName), description: text.description };
}

function headingOf(request: StaffChangeRequest): { title: string; description: string } {
  if (request.kind === 'revokeInvite') {
    const text = staffCopy.invites;
    return { title: text.revokeTitle(request.invite.email), description: text.revokeDescription };
  }
  const { member } = request;
  if (request.kind === 'role') {
    return {
      title: staffCopy.role.title(member.fullName),
      description: staffCopy.role.description,
    };
  }
  if (request.kind === 'cancelPromotion') {
    const text = staffCopy.promotion;
    return { title: text.title(member.fullName), description: text.description };
  }
  if (request.kind === 'mfaReset' || request.kind === 'cancelMfaReset') {
    return mfaResetHeading(request.kind, member);
  }
  if (request.kind === 'reenrolmentCode') {
    const text = staffCopy.reenrolment;
    return { title: text.title(member.fullName), description: text.description };
  }
  const text = staffCopy.status;
  return member.isActive
    ? { title: text.deactivateTitle(member.fullName), description: text.deactivateDescription }
    : { title: text.reactivateTitle(member.fullName), description: text.reactivateDescription };
}

function roleMessage(change: StaffRoleChange): string {
  return change.stage === 'applied'
    ? staffCopy.role.applied
    : staffCopy.role.requested(formatDateTimeShort(change.completesAfter));
}

function statusMessage(member: StaffMember, change: StaffStatusChange): void {
  if (!change.isBanApplied) {
    toast.warning(staffCopy.status.banFailed);
    return;
  }
  toast.success(member.isActive ? staffCopy.status.deactivated : staffCopy.status.reactivated);
}

// Revoking an invite and cancelling a promotion take nothing but the code.
function codeOnlyChangeOf(request: StaffChangeRequest, actions: StaffChangeActions) {
  if (request.kind === 'revokeInvite') {
    return {
      label: staffCopy.invites.revoke,
      run: () => actions.revokeInviteAction({ inviteId: request.invite.id }),
      done: staffCopy.invites.revoked,
    };
  }
  if (request.kind === 'cancelPromotion') {
    return {
      label: staffCopy.promotion.submit,
      run: () => actions.cancelPromotionAction({ userId: request.member.id }),
      done: staffCopy.promotion.cancelled,
    };
  }
  return null;
}

type BodyProps = Omit<StaffChangeDialogProps, 'onClose'> & {
  finish: (message: string | null) => void;
};

function MemberChangeBody({
  member,
  kind,
  rwUnits,
  actions,
  finish,
}: Omit<BodyProps, 'request'> & { member: StaffMember; kind: 'role' | 'status' }) {
  const { stepUpAction } = actions;
  if (kind === 'role') {
    return (
      <RoleChangeForm
        member={member}
        rwUnits={rwUnits}
        submit={withStepUp(stepUpAction, actions.setRoleAction)}
        onDone={(change) => {
          finish(roleMessage(change));
        }}
      />
    );
  }
  return (
    <StatusChangeForm
      member={member}
      submit={withStepUp(stepUpAction, actions.setStatusAction)}
      onDone={(change) => {
        statusMessage(member, change);
        finish(null);
      }}
    />
  );
}

function MfaBody({
  kind,
  member,
  actions,
  finish,
}: {
  kind: MfaKind;
  member: StaffMember;
  actions: StaffChangeActions;
  finish: BodyProps['finish'];
}) {
  const Body = { mfaReset: MfaResetBody, cancelMfaReset: CancelMfaResetBody, reenrolmentCode: ReenrolmentCodeBody }[
    kind
  ];
  return <Body member={member} actions={actions} finish={finish} />;
}

function isMfaKind(kind: StaffChangeRequest['kind']): kind is MfaKind {
  return kind === 'mfaReset' || kind === 'cancelMfaReset' || kind === 'reenrolmentCode';
}

function ChangeBody({ request, ...props }: BodyProps) {
  const codeOnly = codeOnlyChangeOf(request, props.actions);
  if (codeOnly) {
    return (
      <CodeConfirmForm
        submitLabel={codeOnly.label}
        submit={withStepUp(props.actions.stepUpAction, codeOnly.run)}
        onDone={() => {
          props.finish(codeOnly.done);
        }}
      />
    );
  }
  if (request.kind === 'revokeInvite' || request.kind === 'cancelPromotion') return null;
  if (isMfaKind(request.kind)) {
    return (
      <MfaBody
        kind={request.kind}
        member={request.member}
        actions={props.actions}
        finish={props.finish}
      />
    );
  }
  return <MemberChangeBody {...props} member={request.member} kind={request.kind} />;
}

// docs/Security.md §5.3: every change of /dashboard/users asks for the authenticator code in this dialog (a Dialog
// from md up, a Drawer below), loaded on the first row action.
export function StaffChangeDialog({ request, onClose, ...body }: StaffChangeDialogProps) {
  const router = useRouter();
  const { title, description } = headingOf(request);
  const finish = (message: string | null) => {
    if (message) toast.success(message);
    onClose();
    router.refresh();
  };
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
      <ChangeBody request={request} {...body} finish={finish} />
    </ResponsiveDialog>
  );
}
