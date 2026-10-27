'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useActionForm } from '@/hooks/use-action-form';
import { adjustmentsCopy } from '@/lib/copy/finance-adjustments';
import { staffCopy } from '@/lib/copy/staff';
import { rejectAdjustmentFormSchema } from '@/lib/validations/finance';
import type { ActionResult } from '@/types/action-result';

const text = adjustmentsCopy;

export interface RejectFormProps {
  adjustmentId: string;
  submit: (values: unknown) => Promise<ActionResult<unknown>>;
  onDone: () => void;
}

// Task P4.7.04 (re-review of PR #68, N2): a proposal turned down, or an approval withdrawn once it can no longer apply,
// always with its reason, which the audit log keeps.
export function RejectForm({ adjustmentId, submit: action, onDone }: RejectFormProps) {
  const form = useForm({
    resolver: zodResolver(rejectAdjustmentFormSchema),
    defaultValues: { adjustmentId, reason: '', code: '' },
  });
  const { submit, failure } = useActionForm({ form, action, fields: ['reason', 'code'], onSuccess: onDone });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="reason"
          label={text.rejectReason}
          description={text.fields.reasonHint}
          required
          render={(field) => <Textarea {...field} rows={3} />}
        />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <Button type="submit" size="lg" variant="destructive" className="w-full" loading={form.formState.isSubmitting}>
          {text.reject}
        </Button>
      </PostForm>
    </Form>
  );
}
