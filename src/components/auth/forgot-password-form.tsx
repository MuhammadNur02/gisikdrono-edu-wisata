'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, type Control } from 'react-hook-form';

import { AuthLink } from '@/components/auth/auth-link';
import { CaptchaSubmit } from '@/components/auth/captcha-submit';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { LOGIN_PATH } from '@/config/auth';
import { useActionForm } from '@/hooks/use-action-form';
import { useTurnstileToken } from '@/hooks/use-turnstile-token';
import { copy } from '@/lib/copy/id';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations/auth';
import type { ActionResult } from '@/types/action-result';

const text = copy.auth.forgot;

export interface ForgotPasswordFormProps {
  // requestPasswordResetAction, handed in by the page.
  action: (values: unknown) => Promise<ActionResult<null>>;
}

// The same note for every address: whether one is staff is never shown (docs/Security.md §5.1).
function SentNotice() {
  return (
    <div className="space-y-5">
      <FormAlert tone="info">
        <p className="font-medium">{text.sentTitle}</p>
        <p>{text.sent}</p>
      </FormAlert>
      <AuthLink href={LOGIN_PATH}>{text.back}</AuthLink>
    </div>
  );
}

function EmailField({ control }: { control: Control<ForgotPasswordInput> }) {
  return (
    <FormField
      control={control}
      name="email"
      label={copy.auth.signIn.email}
      required
      render={(field) => <Input {...field} type="email" autoComplete="email" inputMode="email" />}
    />
  );
}

export function ForgotPasswordForm({ action }: ForgotPasswordFormProps) {
  const [isSent, setIsSent] = useState(false);
  const form = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '', captchaToken: '' },
  });
  const captcha = useTurnstileToken((token) => {
    form.setValue('captchaToken', token, { shouldValidate: token !== '' });
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['email', 'captchaToken'],
    onSuccess: () => {
      setIsSent(true);
    },
    onFailure: captcha.renew,
  });

  if (isSent) return <SentNotice />;
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <EmailField control={form.control} />
        <CaptchaSubmit
          captcha={captcha}
          action="password_reset"
          error={form.formState.errors.captchaToken?.message}
          label={text.submit}
          isBusy={form.formState.isSubmitting}
        />
        <AuthLink href={LOGIN_PATH}>{text.back}</AuthLink>
      </PostForm>
    </Form>
  );
}
