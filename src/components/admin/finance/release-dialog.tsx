'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Unlock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { Textarea } from '@/components/ui/textarea';
import { useActionForm } from '@/hooks/use-action-form';
import { adjustmentsCopy } from '@/lib/copy/finance-adjustments';
import { staffCopy } from '@/lib/copy/staff';
import { withStepUp } from '@/lib/utils/step-up';
import { releaseKeyMismatchFormSchema } from '@/lib/validations/finance';
import type { ActionResult } from '@/types/action-result';

const text = adjustmentsCopy.release;

type FormAction = (values: unknown) => Promise<ActionResult<null>>;
const RELEASE_FIELDS = ['note', 'code'] as const;

export interface ReleaseDialogProps {
  adjustmentId: string;
  releaseAction: FormAction;
  stepUpAction: FormAction;
}

function SubmitRelease({ isSubmitting }: { isSubmitting: boolean }) {
  return (
    <Button type="submit" size="lg" variant="destructive" className="w-full" loading={isSubmitting}>
      {text.submit}
    </Button>
  );
}

function ReleaseForm({
  adjustmentId,
  submit: action,
  onDone,
}: {
  adjustmentId: string;
  submit: FormAction;
  onDone: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(releaseKeyMismatchFormSchema),
    defaultValues: { adjustmentId, note: '', code: '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: RELEASE_FIELDS,
    onSuccess: onDone,
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="note"
          label={text.note}
          description={text.noteHint}
          required
          render={(field) => <Textarea {...field} rows={3} />}
        />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <SubmitRelease isSubmitting={form.formState.isSubmitting} />
      </PostForm>
    </Form>
  );
}

// Review of PR #80, L-1 (owner decision): an applied manual refund Midtrans lists under its key with another amount
// blocks record_refund until the superadmin, having checked the Midtrans dashboard, releases it with a note and the
// authenticator code; Midtrans' figure counts from then on.
export function ReleaseDialog({ adjustmentId, releaseAction, stepUpAction }: ReleaseDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setIsOpen(true);
        }}
      >
        <Unlock aria-hidden />
        {text.button}
      </Button>
      <ResponsiveDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title={text.title}
        description={text.description}
        size="form"
      >
        {isOpen ? (
          <ReleaseForm
            adjustmentId={adjustmentId}
            submit={withStepUp(stepUpAction, releaseAction)}
            onDone={() => {
              toast.success(text.done);
              setIsOpen(false);
              router.refresh();
            }}
          />
        ) : null}
      </ResponsiveDialog>
    </>
  );
}
