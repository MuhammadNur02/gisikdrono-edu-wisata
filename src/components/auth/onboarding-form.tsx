'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, type Control } from 'react-hook-form';

import { EnrolmentInstructions } from '@/components/auth/mfa-enrol-form';
import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useActionForm } from '@/hooks/use-action-form';
import { useReplaceNavigation } from '@/hooks/use-replace-navigation';
import { copy } from '@/lib/copy/id';
import {
  claimInviteSchema,
  completeOnboardingSchema,
  type CompleteOnboardingInput,
} from '@/lib/validations/onboarding';
import type { ActionResult } from '@/types/action-result';
import type { NextStep, OnboardingFactorStep } from '@/types/auth';

const text = copy.auth.onboarding;

export interface OnboardingFormProps {
  // claimInviteAction and completeOnboardingAction, handed in by the page.
  claimAction: (values: unknown) => Promise<ActionResult<OnboardingFactorStep>>;
  completeAction: (values: unknown) => Promise<ActionResult<NextStep>>;
}

interface ClaimStepProps {
  action: OnboardingFormProps['claimAction'];
  notice: string | null;
  onClaimed: (inviteCode: string, step: OnboardingFactorStep) => void;
}

// The code before any QR code (docs/Security.md §5.1): the server binds the invite to this session first.
function ClaimStep({ action, notice, onClaimed }: ClaimStepProps) {
  const form = useForm({
    resolver: zodResolver(claimInviteSchema),
    defaultValues: { inviteCode: '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['inviteCode'],
    onSuccess: (step) => {
      onClaimed(form.getValues('inviteCode'), step);
    },
  });
  const message = failure ?? notice;
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {message ? <FormAlert tone="danger">{message}</FormAlert> : null}
        <FormField
          control={form.control}
          name="inviteCode"
          label={text.inviteCode}
          description={text.inviteCodeHint}
          required
          render={(field) => (
            <Input {...field} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
          )}
        />
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {text.claimSubmit}
        </Button>
      </PostForm>
    </Form>
  );
}

function PasswordFields({ control }: { control: Control<CompleteOnboardingInput> }) {
  return (
    <>
      <FormField
        control={control}
        name="password"
        label={copy.auth.reset.password}
        description={copy.auth.reset.passwordHint}
        required
        render={(field) => <Input {...field} type="password" autoComplete="new-password" />}
      />
      <FormField
        control={control}
        name="confirmPassword"
        label={copy.auth.reset.confirmPassword}
        required
        render={(field) => <Input {...field} type="password" autoComplete="new-password" />}
      />
    </>
  );
}

interface CompleteStepProps {
  action: OnboardingFormProps['completeAction'];
  inviteCode: string;
  step: OnboardingFactorStep;
  onRestart: (message: string) => void;
}

// The authenticator, then the password: the server sets the password only once this session is at AAL2.
function CompleteStep({ action, inviteCode, step, onRestart }: CompleteStepProps) {
  const { isNavigating, navigate } = useReplaceNavigation();
  const form = useForm({
    resolver: zodResolver(completeOnboardingSchema),
    defaultValues: { inviteCode, totpCode: '', password: '', confirmPassword: '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['totpCode', 'password', 'confirmPassword'],
    onSuccess: ({ redirectTo }) => {
      navigate(redirectTo);
    },
    onFailure: (error) => {
      if (error.code === 'FORBIDDEN' || error.code === 'INTERNAL') onRestart(error.message);
    },
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {step.kind === 'enrol' ? (
          <EnrolmentInstructions enrolment={step.enrolment} />
        ) : (
          <p className="text-body-sm">{text.factorReady}</p>
        )}
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <TotpCodeField control={form.control} name="totpCode" />
        <PasswordFields control={form.control} />
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={form.formState.isSubmitting || isNavigating}
        >
          {text.completeSubmit}
        </Button>
      </PostForm>
    </Form>
  );
}

// Task P4.8.01: invite code, authenticator and password in one flow; a refusal after the code starts it again.
export function OnboardingForm({ claimAction, completeAction }: OnboardingFormProps) {
  const [claimed, setClaimed] = useState<{ inviteCode: string; step: OnboardingFactorStep } | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  if (!claimed) {
    return (
      <ClaimStep
        action={claimAction}
        notice={notice}
        onClaimed={(inviteCode, step) => {
          setNotice(null);
          setClaimed({ inviteCode, step });
        }}
      />
    );
  }
  return (
    <CompleteStep
      action={completeAction}
      inviteCode={claimed.inviteCode}
      step={claimed.step}
      onRestart={(message) => {
        setNotice(message);
        setClaimed(null);
      }}
    />
  );
}
