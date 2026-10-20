'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Control } from 'react-hook-form';

import { AuthLink } from '@/components/auth/auth-link';
import { CaptchaSubmit } from '@/components/auth/captcha-submit';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { FORGOT_PASSWORD_PATH } from '@/config/auth';
import { useActionForm } from '@/hooks/use-action-form';
import { useReplaceNavigation } from '@/hooks/use-replace-navigation';
import { useTurnstileToken } from '@/hooks/use-turnstile-token';
import { copy } from '@/lib/copy/id';
import { signInSchema, type SignInInput } from '@/lib/validations/auth';
import type { ActionResult } from '@/types/action-result';
import type { NextStep } from '@/types/auth';

const text = copy.auth.signIn;

export interface SignInFormProps {
  // signInAction, handed in by the page: components never import src/server (CLAUDE.md §3.2).
  action: (values: unknown) => Promise<ActionResult<NextStep>>;
  next?: string | undefined;
}

function CredentialFields({ control }: { control: Control<SignInInput> }) {
  return (
    <>
      <FormField
        control={control}
        name="email"
        label={text.email}
        required
        render={(field) => (
          <Input {...field} type="email" autoComplete="username" inputMode="email" />
        )}
      />
      <FormField
        control={control}
        name="password"
        label={text.password}
        required
        render={(field) => <Input {...field} type="password" autoComplete="current-password" />}
      />
    </>
  );
}

export function SignInForm({ action, next }: SignInFormProps) {
  const { isNavigating, navigate } = useReplaceNavigation();
  const form = useForm({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '', captchaToken: '', next },
  });
  const captcha = useTurnstileToken((token) => {
    form.setValue('captchaToken', token, { shouldValidate: token !== '' });
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['email', 'password', 'captchaToken'],
    onSuccess: ({ redirectTo }) => {
      navigate(redirectTo);
    },
    onFailure: captcha.renew,
  });

  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <CredentialFields control={form.control} />
        <CaptchaSubmit
          captcha={captcha}
          action="login"
          error={form.formState.errors.captchaToken?.message}
          label={text.submit}
          isBusy={form.formState.isSubmitting || isNavigating}
        />
        <AuthLink href={FORGOT_PASSWORD_PATH}>{text.forgot}</AuthLink>
      </PostForm>
    </Form>
  );
}
