'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { useActionForm } from '@/hooks/use-action-form';
import { stepUpSchema } from '@/lib/validations/step-up';
import type { ActionResult } from '@/types/action-result';

export interface StepUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  // verifyStaffTotpAction, handed in by the page.
  verifyAction: (values: unknown) => Promise<ActionResult<null>>;
  // The critical write itself, run once the code is verified; its own failure is shown by the caller.
  onVerified: () => Promise<void>;
}

function StepUpForm({
  verifyAction,
  onVerified,
  confirmLabel,
}: Pick<StepUpDialogProps, 'verifyAction' | 'onVerified' | 'confirmLabel'>) {
  const form = useForm({ resolver: zodResolver(stepUpSchema), defaultValues: { code: '' } });
  const { submit, failure } = useActionForm({
    form,
    action: async (values) => {
      const verified = await verifyAction(values);
      if (verified.ok) await onVerified();
      return verified;
    },
    fields: ['code'],
    onSuccess: () => undefined,
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <TotpCodeField control={form.control} name="code" autoFocus />
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {confirmLabel}
        </Button>
      </PostForm>
    </Form>
  );
}

// docs/Security.md §5.3 (AUTH-11): a critical write asks for a code from the authenticator first. The code refreshes
// the session's TOTP time, which the Server Action and the database's fresh_totp() policies then accept for five
// minutes. A Dialog from md up, a Drawer below it; the form mounts only while open, so each opening starts empty.
export function StepUpDialog({
  open,
  onOpenChange,
  title,
  description,
  ...form
}: StepUpDialogProps) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
    >
      {open ? <StepUpForm {...form} /> : null}
    </ResponsiveDialog>
  );
}
