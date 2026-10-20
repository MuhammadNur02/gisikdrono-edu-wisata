'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { CaptchaSubmit } from '@/components/auth/captcha-submit';
import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { Form } from '@/components/ui/form';
import { useActionForm } from '@/hooks/use-action-form';
import { useReplaceNavigation } from '@/hooks/use-replace-navigation';
import { useTurnstileToken } from '@/hooks/use-turnstile-token';
import { copy } from '@/lib/copy/id';
import { verifyMfaSchema } from '@/lib/validations/mfa';
import type { ActionResult } from '@/types/action-result';
import type { NextStep } from '@/types/auth';

const text = copy.auth.mfa;

export interface MfaVerifyFormProps {
  // verifyMfaAction, handed in by the page.
  action: (values: unknown) => Promise<ActionResult<NextStep>>;
  next?: string | undefined;
}

export function MfaVerifyForm({ action, next }: MfaVerifyFormProps) {
  const { isNavigating, navigate } = useReplaceNavigation();
  const form = useForm({
    resolver: zodResolver(verifyMfaSchema),
    defaultValues: { code: '', captchaToken: '', next },
  });
  const captcha = useTurnstileToken((token) => {
    form.setValue('captchaToken', token, { shouldValidate: token !== '' });
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['code', 'captchaToken'],
    onSuccess: ({ redirectTo }) => {
      navigate(redirectTo);
    },
    onFailure: captcha.renew,
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <TotpCodeField control={form.control} name="code" description={text.codeHint} autoFocus />
        <CaptchaSubmit
          captcha={captcha}
          action="mfa_verify"
          error={form.formState.errors.captchaToken?.message}
          label={text.verifySubmit}
          isBusy={form.formState.isSubmitting || isNavigating}
        />
      </form>
    </Form>
  );
}
