'use client';

import { useState } from 'react';

import { useCountdown } from '@/hooks/use-countdown';
import { useTurnstileToken } from '@/hooks/use-turnstile-token';
import { copy } from '@/lib/copy/id';
import type { ActionFailure, ActionResult } from '@/types/action-result';
import type { OtpChannel, OtpRequestAnswer, OtpVerifyAnswer, VerifiedContact } from '@/types/guest';

// The state behind PhoneOtpField (src/components/booking/phone-otp-field.tsx): the step the visitor is at, what they
// typed, the action running and its refusal. The actions come in from the page, so nothing here reaches the server
// by itself.

const text = copy.booking.otp;

export type Step =
  | { name: 'contact'; channel: OtpChannel }
  | { name: 'code'; channel: OtpChannel }
  | { name: 'verified'; channel: OtpChannel };

export type FieldName = 'phone' | 'email' | 'code' | 'turnstileToken';
export type Errors = Partial<Record<FieldName, string>>;

export interface PhoneOtpActions {
  requestAction: (values: unknown) => Promise<ActionResult<OtpRequestAnswer>>;
  verifyAction: (values: unknown) => Promise<ActionResult<OtpVerifyAnswer>>;
  onVerified?: (verified: VerifiedContact) => void;
}

export interface PhoneOtpOptions extends PhoneOtpActions {
  // A contact this browser proved before, shown as verified (the wizard's data step, visited again).
  verified?: VerifiedContact | null;
  // A contact proved again, which may not change (the wizard's summary step, decision of 2026-10-22 on P3.5, Q2).
  fixedContact?: { phone: string; email: string | null } | null;
  // The visitor left a verified contact to type another one.
  onContactChange?: () => void;
}

function fieldErrorsOf(failure: ActionFailure): Errors {
  const fields = failure.error.fieldErrors ?? {};
  const first = (name: FieldName) => fields[name]?.[0];
  return {
    phone: first('phone'),
    email: first('email'),
    code: first('code'),
    turnstileToken: first('turnstileToken'),
  };
}

// Runs one action at a time and keeps its refusal: the message above the field, field errors under the inputs.
function useActionRun() {
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  async function run<T>(call: () => Promise<ActionResult<T>>, onOk: (data: T) => void) {
    setIsBusy(true);
    setFailure(null);
    setErrors({});
    const result = await call();
    setIsBusy(false);
    if (result.ok) {
      onOk(result.data);
      return;
    }
    setErrors(fieldErrorsOf(result));
    setFailure(result.error.message);
  }
  return { isBusy, failure, errors, run };
}

function useOtpValues(initial: { phone: string; email: string | null } | null) {
  const [values, setValues] = useState({
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    code: '',
    turnstileToken: '',
  });
  const captcha = useTurnstileToken((turnstileToken) => {
    setValues((current) => ({ ...current, turnstileToken }));
  });
  const setValue = (name: Exclude<FieldName, 'turnstileToken'>) => (value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };
  return { values, setValue, captcha };
}

function verifiedStatus(channel: OtpChannel): string {
  return channel === 'email' ? text.verifiedEmail : text.verifiedWhatsapp;
}

// Where the visitor is (number, code, done) and what the polite status line says about it.
function useOtpSteps(onVerified: PhoneOtpActions['onVerified'], initialStep: Step) {
  const [step, setStep] = useState<Step>(initialStep);
  const [status, setStatus] = useState(
    initialStep.name === 'verified' ? verifiedStatus(initialStep.channel) : '',
  );
  const cooldown = useCountdown();

  function onCodeSent(answer: OtpRequestAnswer) {
    if (answer.status === 'degraded') {
      setStep({ name: 'contact', channel: 'email' });
      setStatus(text.degraded);
      return;
    }
    setStep({ name: 'code', channel: answer.channel });
    setStatus(answer.channel === 'email' ? text.sentEmail : text.sentWhatsapp);
    cooldown.start(answer.resendAfterSeconds);
  }

  function onCodeVerified(answer: OtpVerifyAnswer, contact: { phone: string; email: string }) {
    setStep({ name: 'verified', channel: answer.channel });
    setStatus(verifiedStatus(answer.channel));
    onVerified?.({
      channel: answer.channel,
      phone: contact.phone,
      email: answer.channel === 'email' ? contact.email : null,
    });
  }

  return { step, setStep, status, cooldown, onCodeSent, onCodeVerified };
}

type OtpSteps = ReturnType<typeof useOtpSteps>;
type OtpValues = ReturnType<typeof useOtpValues>;

// Asking for a code and checking it, for the contact typed in.
function useOtpRequests(options: PhoneOtpOptions, steps: OtpSteps, { values, captcha }: OtpValues) {
  const action = useActionRun();
  const contactFor = (channel: OtpChannel) => ({
    channel,
    phone: values.phone,
    email: channel === 'email' ? values.email : null,
  });

  // A Turnstile token is good once, so every request, answered or refused, is followed by a fresh one.
  async function sendCode(channel: OtpChannel) {
    const request = { ...contactFor(channel), turnstileToken: values.turnstileToken };
    await action.run(() => options.requestAction(request), steps.onCodeSent);
    captcha.renew();
  }

  // The code is checked against the one this browser asked for, for the same contact.
  async function verifyCode(channel: OtpChannel) {
    const check = { ...contactFor(channel), code: values.code };
    await action.run(
      () => options.verifyAction(check),
      (answer) => {
        steps.onCodeVerified(answer, values);
      },
    );
  }

  return { action, sendCode, verifyCode };
}

export function usePhoneOtp(options: PhoneOtpOptions) {
  const { onVerified, verified, fixedContact } = options;
  const steps = useOtpSteps(
    onVerified,
    verified
      ? { name: 'verified', channel: verified.channel }
      : { name: 'contact', channel: 'whatsapp' },
  );
  const otpValues = useOtpValues(verified ?? fixedContact ?? null);
  const requests = useOtpRequests(options, steps, otpValues);

  // Typing another number or address leaves the proof of the last one behind.
  function changeContact(channel: OtpChannel) {
    steps.setStep({ name: 'contact', channel });
    options.onContactChange?.();
  }

  return {
    ...steps,
    ...otpValues,
    ...requests,
    isContactFixed: Boolean(fixedContact),
    changeContact,
  };
}

export type PhoneOtp = ReturnType<typeof usePhoneOtp>;
