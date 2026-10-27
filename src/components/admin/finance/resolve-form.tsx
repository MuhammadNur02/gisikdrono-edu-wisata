'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

import { OptionSelect } from '@/components/admin/finance/option-select';
import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { ISSUE_RESOLUTIONS } from '@/config/finance';
import { useActionForm } from '@/hooks/use-action-form';
import { reconciliationCopy } from '@/lib/copy/finance-adjustments';
import { staffCopy } from '@/lib/copy/staff';
import { resolveIssueFormSchema } from '@/lib/validations/finance';
import type { ActionResult } from '@/types/action-result';

const text = reconciliationCopy;
type ResolveInput = z.input<typeof resolveIssueFormSchema>;
type ResolveValues = z.output<typeof resolveIssueFormSchema>;

const RESOLUTION_OPTIONS = ISSUE_RESOLUTIONS.map((resolution) => ({
  value: resolution,
  label: text.resolutions[resolution],
}));

function ResolutionField({ form }: { form: UseFormReturn<ResolveInput, unknown, ResolveValues> }) {
  return (
    <FormField
      control={form.control}
      name="resolution"
      label={text.resolution}
      required
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value}
          onChange={field.onChange}
          options={RESOLUTION_OPTIONS}
          placeholder={text.resolution}
          trigger={field}
        />
      )}
    />
  );
}

export interface ResolveFormProps {
  issueId: string;
  submit: (values: unknown) => Promise<ActionResult<null>>;
  onDone: () => void;
}

// Task P4.7.04 (20261104190000): an issue closed as resolved or ignored, with its note, in the superadmin's own name; a
// closed issue stays closed.
export function ResolveForm({ issueId, submit: action, onDone }: ResolveFormProps) {
  const form = useForm<ResolveInput, unknown, ResolveValues>({
    resolver: zodResolver(resolveIssueFormSchema),
    defaultValues: { issueId, resolution: 'resolved', note: '', code: '' },
  });
  const fields = ['resolution', 'note', 'code'] as const;
  const { submit, failure } = useActionForm({ form, action, fields, onSuccess: onDone });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <ResolutionField form={form} />
        <FormField
          control={form.control}
          name="note"
          label={text.note}
          description={text.noteHint}
          required
          render={(field) => <Textarea {...field} rows={3} />}
        />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {text.resolve}
        </Button>
      </PostForm>
    </Form>
  );
}
