'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { SubmitButton, type ChangeFormProps } from '@/components/admin/staff/code-confirm-form';
import { RoleField, RwField, type RwOption } from '@/components/admin/staff/role-select';
import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Form } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useActionForm } from '@/hooks/use-action-form';
import { staffCopy } from '@/lib/copy/staff';
import {
  isAssignableRole,
  setStaffRoleFormSchema,
  setStaffStatusFormSchema,
} from '@/lib/validations/staff';
import type { StaffMember, StaffRoleChange, StaffStatusChange } from '@/types/staff';

// The forms of the staff change dialog (Task P4.8.02). Each carries the authenticator code; the submit handed in
// already wraps the action with withStepUp, so the code is checked before the change is sent.

function useRoleForm(
  member: StaffMember,
  { submit: action, onDone }: ChangeFormProps<StaffRoleChange>,
) {
  const form = useForm({
    resolver: zodResolver(setStaffRoleFormSchema),
    defaultValues: {
      userId: member.id,
      role: isAssignableRole(member.role) ? member.role : ('admin_rw' as const),
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
          onRoleWithoutRw={() => {
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
