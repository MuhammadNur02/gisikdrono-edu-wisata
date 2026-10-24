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
import { Input } from '@/components/ui/input';
import { useActionForm } from '@/hooks/use-action-form';
import { staffCopy } from '@/lib/copy/staff';
import { withStepUp } from '@/lib/utils/step-up';
import { inviteStaffFormSchema } from '@/lib/validations/staff';
import type { ActionResult } from '@/types/action-result';
import type { IssuedInvite } from '@/types/staff';

const text = staffCopy.invite;

export interface InviteFormProps {
  rwUnits: readonly RwOption[];
  inviteAction: (values: unknown) => Promise<ActionResult<IssuedInvite>>;
  stepUpAction: (values: unknown) => Promise<ActionResult<null>>;
  onIssued: (issued: IssuedInvite) => void;
}

function useInviteForm({ inviteAction, stepUpAction, onIssued }: Omit<InviteFormProps, 'rwUnits'>) {
  const form = useForm({
    resolver: zodResolver(inviteStaffFormSchema),
    defaultValues: { email: '', role: 'admin_rw' as const, rwId: null, code: '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action: withStepUp(stepUpAction, inviteAction),
    fields: ['email', 'role', 'rwId', 'code'],
    onSuccess: onIssued,
  });
  return { form, submit, failure };
}

// Task P4.8.02: the address, the role and, for an RW admin, the RW; the authenticator code confirms it (§5.3).
export function InviteForm({ rwUnits, ...handlers }: InviteFormProps) {
  const { form, submit, failure } = useInviteForm(handlers);
  const isRwAdmin = form.watch('role') === 'admin_rw';
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="email"
          label={text.email}
          required
          render={(field) => <Input {...field} type="email" autoComplete="off" inputMode="email" />}
        />
        <RoleField
          control={form.control}
          name="role"
          label={text.role}
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
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {text.submit}
        </Button>
      </PostForm>
    </Form>
  );
}
