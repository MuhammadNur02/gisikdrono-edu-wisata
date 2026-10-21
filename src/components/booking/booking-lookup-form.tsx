'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, type Control } from 'react-hook-form';

import { CaptchaSubmit } from '@/components/auth/captcha-submit';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { TURNSTILE_ACTIONS } from '@/config/auth';
import { useActionForm } from '@/hooks/use-action-form';
import { useTurnstileToken } from '@/hooks/use-turnstile-token';
import { copy } from '@/lib/copy/id';
import { lookupBookingSchema, type LookupBookingInput } from '@/lib/validations/guest';
import type { ActionResult } from '@/types/action-result';

const text = copy.booking.lookup;

export interface BookingLookupFormProps {
  // lookupBookingAction, handed in by the page.
  action: (values: unknown) => Promise<ActionResult<null>>;
}

// The same note whatever was found (docs/Security.md GUEST-01): the page never says whether a code exists.
function SentNotice({ onAgain }: { onAgain: () => void }) {
  return (
    <div className="space-y-5">
      <FormAlert tone="info">
        <p className="font-medium">{text.sentTitle}</p>
        <p>{text.sent}</p>
      </FormAlert>
      <Button type="button" variant="outline" size="lg" className="w-full" onClick={onAgain}>
        {text.again}
      </Button>
    </div>
  );
}

function LookupFields({ control }: { control: Control<LookupBookingInput> }) {
  return (
    <>
      <FormField
        control={control}
        name="bookingCode"
        label={text.codeLabel}
        description={text.codeHint}
        required
        render={(field) => (
          <Input {...field} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
        )}
      />
      <FormField
        control={control}
        name="contact"
        label={text.contactLabel}
        required
        render={(field) => <Input {...field} autoComplete="tel email" />}
      />
    </>
  );
}

function useLookupForm(action: BookingLookupFormProps['action']) {
  const [isSent, setIsSent] = useState(false);
  const form = useForm({
    resolver: zodResolver(lookupBookingSchema),
    defaultValues: { bookingCode: '', contact: '', turnstileToken: '' },
  });
  const captcha = useTurnstileToken((token) => {
    form.setValue('turnstileToken', token, { shouldValidate: token !== '' });
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['bookingCode', 'contact', 'turnstileToken'],
    onSuccess: () => {
      setIsSent(true);
      form.reset();
    },
    onFailure: captcha.renew,
  });
  return { form, captcha, submit, failure, isSent, setIsSent };
}

export function BookingLookupForm({ action }: BookingLookupFormProps) {
  const { form, captcha, submit, failure, isSent, setIsSent } = useLookupForm(action);
  const startAgain = () => {
    setIsSent(false);
  };
  if (isSent) return <SentNotice onAgain={startAgain} />;
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <LookupFields control={form.control} />
        <CaptchaSubmit
          captcha={captcha}
          action={TURNSTILE_ACTIONS.bookingLookup}
          error={form.formState.errors.turnstileToken?.message}
          label={text.submit}
          isBusy={form.formState.isSubmitting}
        />
      </PostForm>
    </Form>
  );
}
