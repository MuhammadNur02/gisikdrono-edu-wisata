'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Control } from 'react-hook-form';

import { CaptchaSubmit } from '@/components/auth/captcha-submit';
import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useActionForm } from '@/hooks/use-action-form';
import { useReplaceNavigation } from '@/hooks/use-replace-navigation';
import { useTurnstileToken } from '@/hooks/use-turnstile-token';
import { copy } from '@/lib/copy/id';
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/validations/auth';
import type { ActionResult } from '@/types/action-result';
import type { NextStep } from '@/types/auth';

const text = copy.auth.reset;

export interface ResetPasswordFormProps {
  // resetPasswordAction, handed in by the page.
  action: (values: unknown) => Promise<ActionResult<NextStep>>;
  // The account has a verified factor and the reset link opened only AAL1, so the code is asked for too.
  needsTotp: boolean;
}

function PasswordFields({ control }: { control: Control<ResetPasswordInput> }) {
  return (
    <>
      <FormField
        control={control}
        name="password"
        label={text.password}
        description={text.passwordHint}
        required
        render={(field) => <Input {...field} type="password" autoComplete="new-password" />}
      />
      <FormField
        control={control}
        name="confirmPassword"
        label={text.confirmPassword}
        required
        render={(field) => <Input {...field} type="password" autoComplete="new-password" />}
      />
    </>
  );
}

// The code field exists only when the account needs it; otherwise totpCode stays out of what is sent.
function emptyValues(needsTotp: boolean): ResetPasswordInput {
  return {
    password: '',
    confirmPassword: '',
    totpCode: needsTotp ? '' : undefined,
    captchaToken: '',
  };
}

export function ResetPasswordForm({ action, needsTotp }: ResetPasswordFormProps) {
  const { isNavigating, navigate } = useReplaceNavigation();
  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: emptyValues(needsTotp),
  });
  const captcha = useTurnstileToken((token) => {
    form.setValue('captchaToken', token, { shouldValidate: token !== '' });
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['password', 'confirmPassword', 'totpCode', 'captchaToken'],
    onSuccess: ({ redirectTo }) => {
      navigate(redirectTo);
    },
    onFailure: captcha.renew,
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <PasswordFields control={form.control} />
        {needsTotp ? (
          <TotpCodeField control={form.control} name="totpCode" description={text.totpHint} />
        ) : null}
        <CaptchaSubmit
          captcha={captcha}
          action="password_change"
          error={form.formState.errors.captchaToken?.message}
          label={text.submit}
          isBusy={form.formState.isSubmitting || isNavigating}
        />
      </form>
    </Form>
  );
}
