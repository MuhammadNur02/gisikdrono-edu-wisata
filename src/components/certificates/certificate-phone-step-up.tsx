'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react';
import { useForm, type Control } from 'react-hook-form';
import type { z } from 'zod';

import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { TurnstileField } from '@/components/forms/turnstile-field';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { TURNSTILE_ACTIONS } from '@/config/auth';
import { PHONE_LAST_DIGITS } from '@/config/guest';
import { useActionForm } from '@/hooks/use-action-form';
import { useRefreshAfter } from '@/hooks/use-refresh-after';
import { useTurnstileToken } from '@/hooks/use-turnstile-token';
import { certificatesCopy } from '@/lib/copy/certificates';
import { certificatePhoneSchema } from '@/lib/validations/guest-certificate';
import type { ActionResult } from '@/types/action-result';

const text = certificatesCopy.guest;

export type ProveCertificatePhoneAction = (input: unknown) => Promise<ActionResult<null>>;
type StepUpValues = z.infer<typeof certificatePhoneSchema>;

function StepUpHeading() {
  return (
    <div className="space-y-1">
      <h2 id="certificate-step-up" className="flex items-center gap-2 text-h4 font-bold">
        <ShieldCheck aria-hidden className="size-5 text-primary" />
        {text.stepUpTitle}
      </h2>
      <p className="text-body-sm text-ink-2">{text.stepUpBody}</p>
    </div>
  );
}

function LastFourField({ control }: { control: Control<StepUpValues> }) {
  return (
    <FormField
      control={control}
      name="lastFour"
      label={text.lastFour}
      description={text.lastFourHint}
      required
      render={(field) => (
        <Input
          {...field}
          inputMode="numeric"
          autoComplete="off"
          maxLength={PHONE_LAST_DIGITS}
          className="max-w-40 tracking-widest"
        />
      )}
    />
  );
}

// The page reads itself again once the proof is kept, to show the names. A token is good once, so a refused try asks
// Turnstile for a new one.
function useStepUpForm(bookingCode: string, action: ProveCertificatePhoneAction) {
  const refresh = useRefreshAfter();
  const form = useForm({
    resolver: zodResolver(certificatePhoneSchema),
    defaultValues: { bookingCode, lastFour: '', turnstileToken: '' },
  });
  const captcha = useTurnstileToken((token) => {
    form.setValue('turnstileToken', token, { shouldValidate: token !== '' });
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['lastFour', 'turnstileToken'],
    onSuccess: refresh,
    onFailure: captcha.renew,
  });
  return { form, captcha, submit, failure };
}

// Task P4.5.03 (docs/Security.md DOC-02): the last four digits of the PIC's WhatsApp number open the certificates that
// print a person's name.
export function CertificatePhoneStepUp({
  bookingCode,
  action,
}: {
  bookingCode: string;
  action: ProveCertificatePhoneAction;
}) {
  const { form, captcha, submit, failure } = useStepUpForm(bookingCode, action);
  return (
    <section
      aria-labelledby="certificate-step-up"
      className="space-y-4 rounded-2xl bg-muted/50 p-5"
    >
      <StepUpHeading />
      {failure && <FormAlert tone="danger">{failure}</FormAlert>}
      <Form {...form}>
        <PostForm onSubmit={submit}>
          <LastFourField control={form.control} />
          <TurnstileField
            ref={captcha.ref}
            action={TURNSTILE_ACTIONS.certificatePhone}
            onToken={captcha.onToken}
            error={form.formState.errors.turnstileToken?.message}
          />
          <Button
            type="submit"
            size="lg"
            className="w-full sm:w-auto"
            loading={form.formState.isSubmitting}
          >
            {text.stepUp}
          </Button>
        </PostForm>
      </Form>
    </section>
  );
}
