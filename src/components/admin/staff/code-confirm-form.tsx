'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useActionForm } from '@/hooks/use-action-form';
import { staffCopy } from '@/lib/copy/staff';
import { stepUpSchema } from '@/lib/validations/step-up';
import type { ActionResult } from '@/types/action-result';

// The code-only confirmation the staff dialogs, finance and security pages share (Task P4.8.02), apart from the role
// and status forms of change-forms.tsx, so a page that only asks for the authenticator code does not ship the role
// and RW pickers and the staff schemas with it (admin first-load budget, review of PR #117).

type Submit<TData> = (values: unknown) => Promise<ActionResult<TData>>;

export interface ChangeFormProps<TData> {
  submit: Submit<TData>;
  onDone: (data: TData) => void;
}

export function SubmitButton({
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

// A change that needs nothing but the code: cancelling a promotion, revoking an invite, approving an adjustment.
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
