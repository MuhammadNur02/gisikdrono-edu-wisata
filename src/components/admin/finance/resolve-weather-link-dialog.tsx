'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CloudOff } from 'lucide-react';
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
import { resolveWeatherLinkFormSchema } from '@/lib/validations/weather-links';
import type { ActionResult } from '@/types/action-result';

const text = adjustmentsCopy.weatherLinks;

type FormAction = (values: unknown) => Promise<ActionResult<null>>;
const RESOLVE_FIELDS = ['reason', 'code'] as const;

export interface ResolveWeatherLinkDialogProps {
  linkId: string;
  resolveAction: FormAction;
  stepUpAction: FormAction;
}

function SubmitResolve({ isSubmitting }: { isSubmitting: boolean }) {
  return (
    <Button type="submit" size="lg" variant="destructive" className="w-full" loading={isSubmitting}>
      {text.submit}
    </Button>
  );
}

function OpenButton({ onOpen }: { onOpen: () => void }) {
  return (
    <Button type="button" size="sm" variant="outline" onClick={onOpen}>
      <CloudOff aria-hidden />
      {text.button}
    </Button>
  );
}

function ResolveForm({
  linkId,
  submit: action,
  onDone,
}: {
  linkId: string;
  submit: FormAction;
  onDone: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(resolveWeatherLinkFormSchema),
    defaultValues: { linkId, reason: '', code: '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: RESOLVE_FIELDS,
    onSuccess: onDone,
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="reason"
          label={text.reasonLabel}
          description={text.reasonHint}
          required
          render={(field) => <Textarea {...field} rows={3} />}
        />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <SubmitResolve isSubmitting={form.formState.isSubmitting} />
      </PostForm>
    </Form>
  );
}

// Task P4.7.06: a held weather link closed without a refund (public.resolve_weather_link), with a reason and the
// authenticator code, so close_past_bookings can close its booking.
export function ResolveWeatherLinkDialog({
  linkId,
  resolveAction,
  stepUpAction,
}: ResolveWeatherLinkDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <OpenButton
        onOpen={() => {
          setIsOpen(true);
        }}
      />
      <ResponsiveDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title={text.dialogTitle}
        description={text.dialogDescription}
        size="form"
      >
        {isOpen ? (
          <ResolveForm
            linkId={linkId}
            submit={withStepUp(stepUpAction, resolveAction)}
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
