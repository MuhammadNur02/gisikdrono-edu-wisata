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
import { CERTIFICATE_REASON_LIMITS } from '@/config/certificates';
import { useActionForm } from '@/hooks/use-action-form';
import { certificatesCopy } from '@/lib/copy/certificates';
import { staffCopy } from '@/lib/copy/staff';
import { withStepUp } from '@/lib/utils/step-up';
import {
  revokeCertificateFormSchema,
  waiveCertificatesSchema,
} from '@/lib/validations/certificate';
import type { ActionResult } from '@/types/action-result';

const text = certificatesCopy.dashboard;

type FormAction<TData> = (values: unknown) => Promise<ActionResult<TData>>;

function SubmitButton({ label, isSubmitting }: { label: string; isSubmitting: boolean }) {
  return (
    <Button type="submit" variant="destructive" className="min-h-11 w-full" loading={isSubmitting}>
      {label}
    </Button>
  );
}

// FR-POST-02: the superadmin's waiver of the unpaid-pax hold, with the reason audit_logs keeps.
export function WaiveForm({
  bookingId,
  action,
  onDone,
}: {
  bookingId: string;
  action: FormAction<number>;
  onDone: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(waiveCertificatesSchema),
    defaultValues: { bookingId, reason: '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['reason'],
    onSuccess: onDone,
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="reason"
          label={text.reason}
          description={text.reasonHint}
          required
          render={(field) => (
            <Textarea {...field} rows={3} maxLength={CERTIFICATE_REASON_LIMITS.max} />
          )}
        />
        <SubmitButton label={text.waive} isSubmitting={form.formState.isSubmitting} />
      </PostForm>
    </Form>
  );
}

// FR-POST-04: the superadmin revokes one certificate, with the reason the row keeps and a fresh authenticator code
// (docs/Security.md §5.3; review of PR #76, F-76-2), which withStepUp checks before revoke_certificate runs.
interface RevokeFormProps {
  certificateId: string;
  action: FormAction<null>;
  stepUpAction: FormAction<null>;
  onDone: () => void;
}

function useRevokeForm({ certificateId, action, stepUpAction, onDone }: RevokeFormProps) {
  const form = useForm({
    resolver: zodResolver(revokeCertificateFormSchema),
    defaultValues: { certificateId, reason: '', code: '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action: withStepUp(stepUpAction, action),
    fields: ['reason', 'code'],
    onSuccess: onDone,
  });
  return { form, submit, failure };
}

export function RevokeForm(props: RevokeFormProps) {
  const { form, submit, failure } = useRevokeForm(props);
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="reason"
          label={text.reason}
          description={text.reasonHint}
          required
          render={(field) => (
            <Textarea {...field} rows={3} maxLength={CERTIFICATE_REASON_LIMITS.max} />
          )}
        />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <SubmitButton label={text.revoke} isSubmitting={form.formState.isSubmitting} />
      </PostForm>
    </Form>
  );
}
