'use client';

import { useId, type ReactNode } from 'react';

import { TotpCodeInput } from '@/components/auth/totp-code-input';
import { FormAlert } from '@/components/forms/form-alert';
import { PhoneInput } from '@/components/forms/phone-input';
import { TurnstileField } from '@/components/forms/turnstile-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TURNSTILE_ACTIONS } from '@/config/auth';
import { usePhoneOtp, type PhoneOtp, type PhoneOtpActions } from '@/hooks/use-phone-otp';
import { copy } from '@/lib/copy/id';
import type { OtpChannel } from '@/types/guest';

// Task P3.2.03 (docs/PRD.md FR-BOOK-06): the PIC proves the WhatsApp number before any quota is held. It renders no
// <form> of its own, because the booking form it sits in is one (P3.5.02); each step posts through its own button.
// While WhatsApp is limited, the code goes to an email address behind its own Turnstile check instead.

const text = copy.booking.otp;

export type PhoneOtpFieldProps = PhoneOtpActions;

function Field(props: {
  id: string;
  label: string;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      {props.children}
      {props.error ? (
        <p id={`${props.id}-error`} className="text-caption text-destructive">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

// aria-invalid and aria-describedby for an input whose error Field shows (docs/StyleGuide.md §5.6).
function describedBy(id: string, error: string | undefined) {
  return error ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {};
}

function ContactFields({ otp }: { otp: PhoneOtp }) {
  const phoneId = useId();
  const emailId = useId();
  const { step, values, setValue, action } = otp;
  const isEditable = step.name === 'contact';
  return (
    <>
      <Field id={phoneId} label={text.phoneLabel} error={action.errors.phone}>
        <PhoneInput
          id={phoneId}
          value={values.phone}
          onChange={setValue('phone')}
          disabled={!isEditable}
          {...describedBy(phoneId, action.errors.phone)}
        />
      </Field>
      {step.channel === 'email' ? (
        <Field id={emailId} label={text.emailLabel} error={action.errors.email}>
          <Input
            id={emailId}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={values.email}
            disabled={!isEditable}
            {...describedBy(emailId, action.errors.email)}
            onChange={(event) => {
              setValue('email')(event.target.value);
            }}
          />
        </Field>
      ) : null}
    </>
  );
}

function CodeField({ otp }: { otp: PhoneOtp }) {
  const codeId = useId();
  const error = otp.action.errors.code;
  return (
    <Field id={codeId} label={text.codeLabel} error={error}>
      <TotpCodeInput
        id={codeId}
        value={otp.values.code}
        {...describedBy(codeId, error)}
        onChange={(event) => {
          otp.setValue('code')(event.target.value);
        }}
      />
    </Field>
  );
}

interface CodeStepProps {
  otp: PhoneOtp;
  channel: OtpChannel;
}

// Another code only after the cooldown internal.issue_phone_otp enforces anyway; the label counts it down.
function ResendButton({ otp, channel }: CodeStepProps) {
  const { action, cooldown } = otp;
  const isWaiting = cooldown.secondsLeft > 0;
  return (
    <Button
      type="button"
      size="lg"
      variant="outline"
      disabled={action.isBusy || isWaiting}
      onClick={() => void otp.sendCode(channel)}
    >
      {isWaiting ? text.resendIn(cooldown.secondsLeft) : text.resend}
    </Button>
  );
}

function CodeButtons({ otp, channel }: CodeStepProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        type="button"
        size="lg"
        loading={otp.action.isBusy}
        onClick={() => void otp.verifyCode(channel)}
      >
        {text.verify}
      </Button>
      <ResendButton otp={otp} channel={channel} />
      <Button
        type="button"
        size="lg"
        variant="ghost"
        onClick={() => {
          otp.setStep({ name: 'contact', channel });
        }}
      >
        {text.changeContact}
      </Button>
    </div>
  );
}

function StepActions({ otp }: { otp: PhoneOtp }) {
  const { step } = otp;
  if (step.name === 'code') return <CodeButtons otp={otp} channel={step.channel} />;
  if (step.name === 'verified') return null;
  return (
    <Button
      type="button"
      size="lg"
      loading={otp.action.isBusy}
      onClick={() => void otp.sendCode(step.channel)}
    >
      {step.channel === 'email' ? text.sendEmail : text.send}
    </Button>
  );
}

export function PhoneOtpField(props: PhoneOtpFieldProps) {
  const otp = usePhoneOtp(props);
  const { step, action, captcha } = otp;
  const isDegraded = step.name === 'contact' && step.channel === 'email';
  return (
    <div className="space-y-4">
      <p aria-live="polite" className="text-body-sm text-muted-foreground">
        {otp.status}
      </p>
      {action.failure ? <FormAlert tone="danger">{action.failure}</FormAlert> : null}
      {isDegraded ? <FormAlert tone="info">{text.degradedTitle}</FormAlert> : null}
      <ContactFields otp={otp} />
      {step.name === 'code' ? <CodeField otp={otp} /> : null}
      {step.name === 'verified' ? null : (
        <TurnstileField
          ref={captcha.ref}
          action={
            step.channel === 'email' ? TURNSTILE_ACTIONS.otpEmail : TURNSTILE_ACTIONS.otpRequest
          }
          onToken={captcha.onToken}
          error={action.errors.turnstileToken}
        />
      )}
      <StepActions otp={otp} />
    </div>
  );
}
