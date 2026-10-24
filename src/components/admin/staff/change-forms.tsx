'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { RoleField, RwField, type RwOption } from '@/components/admin/staff/role-select';
import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useActionForm } from '@/hooks/use-action-form';
import { staffCopy } from '@/lib/copy/staff';
import { setStaffRoleFormSchema, setStaffStatusFormSchema } from '@/lib/validations/staff';
import { stepUpSchema } from '@/lib/validations/step-up';
import type { ActionResult } from '@/types/action-result';
import type { StaffMember, StaffRoleChange, StaffStatusChange } from '@/types/staff';

// The forms of the staff change dialog (Task P4.8.02). Each carries the authenticator code; the submit handed in
// already wraps the action with withStepUp, so the code is checked before the change is sent.

type Submit<TData> = (values: unknown) => Promise<ActionResult<TData>>;

interface ChangeFormProps<TData> {
  submit: Submit<TData>;
  onDone: (data: TData) => void;
}

function SubmitButton({
  label,
  isDestructive = false,
  isSubmitting,
}: {
  label: string;
  isDestructive?: boolean;
  isSubmitting: boolean;
}) {
  return (
    <Button
      type="submit"
      size="lg"
      className="w-full"
      variant={isDestructive ? 'destructive' : 'default'}
      loading={isSubmitting}
    >
      {label}
    </Button>
  );
}

function useRoleForm(
  member: StaffMember,
  { submit: action, onDone }: ChangeFormProps<StaffRoleChange>,
) {
  const form = useForm({
    resolver: zodResolver(setStaffRoleFormSchema),
    defaultValues: {
      userId: member.id,
      role: member.role === 'superadmin' ? ('superadmin' as const) : ('admin_rw' as const),
      rwId: member.rwId,
      code: '',
    },
  });
  const fields = ['role', 'rwId', 'code'] as const;
  return { form, ...useActionForm({ form, action, fields, onSuccess: onDone }) };
}

export function RoleChangeForm({
  member,
  rwUnits,
  ...handlers
}: ChangeFormProps<StaffRoleChange> & { member: StaffMember; rwUnits: readonly RwOption[] }) {
  const text = staffCopy.role;
  const { form, submit, failure } = useRoleForm(member, handlers);
  const isRwAdmin = form.watch('role') === 'admin_rw';
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <RoleField
          control={form.control}
          name="role"
          label={text.field}
          onSuperadmin={() => {
            form.setValue('rwId', null);
          }}
        />
        {isRwAdmin ? (
          <RwField
            control={form.control}
            name="rwId"
            label={text.rw}
            placeholder={text.rwPlaceholder}
            rwUnits={rwUnits}
          />
        ) : null}
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <SubmitButton label={text.submit} isSubmitting={form.formState.isSubmitting} />
      </PostForm>
    </Form>
  );
}

export function StatusChangeForm({
  member,
  submit: action,
  onDone,
}: ChangeFormProps<StaffStatusChange> & { member: StaffMember }) {
  const form = useForm({
    resolver: zodResolver(setStaffStatusFormSchema),
    defaultValues: { userId: member.id, isActive: !member.isActive, reason: '', code: '' },
  });
  const fields = ['reason', 'code'] as const;
  const { submit, failure } = useActionForm({ form, action, fields, onSuccess: onDone });
  const actions = staffCopy.actions;
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="reason"
          label={staffCopy.status.reason}
          description={staffCopy.status.reasonHint}
          required
          render={(field) => <Textarea {...field} rows={3} />}
        />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <SubmitButton
          label={member.isActive ? actions.deactivate : actions.reactivate}
          isDestructive={member.isActive}
          isSubmitting={form.formState.isSubmitting}
        />
      </PostForm>
    </Form>
  );
}

// A change that needs nothing but the code: cancelling a promotion, revoking an invite.
export function CodeConfirmForm({
  submitLabel,
  isDestructive = true,
  submit: action,
  onDone,
}: ChangeFormProps<null> & { submitLabel: string; isDestructive?: boolean }) {
  const form = useForm({ resolver: zodResolver(stepUpSchema), defaultValues: { code: '' } });
  const { submit, failure } = useActionForm({ form, action, fields: ['code'], onSuccess: onDone });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <TotpCodeField
          control={form.control}
          name="code"
          description={staffCopy.stepUp.hint}
          autoFocus
        />
        <SubmitButton
          label={submitLabel}
          isDestructive={isDestructive}
          isSubmitting={form.formState.isSubmitting}
        />
      </PostForm>
    </Form>
  );
}
