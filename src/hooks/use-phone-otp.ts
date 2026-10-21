'use client';

import { useState } from 'react';

import { useCountdown } from '@/hooks/use-countdown';
import { useTurnstileToken } from '@/hooks/use-turnstile-token';
import { copy } from '@/lib/copy/id';
import type { ActionFailure, ActionResult } from '@/types/action-result';
import type { OtpChannel, OtpRequestAnswer, OtpVerifyAnswer } from '@/types/guest';

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
  onVerified?: (verified: OtpVerifyAnswer & { phone: string }) => void;
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

function useOtpValues() {
  const [values, setValues] = useState({ phone: '', email: '', code: '', turnstileToken: '' });
  const captcha = useTurnstileToken((turnstileToken) => {
    setValues((current) => ({ ...current, turnstileToken }));
  });
  const setValue = (name: Exclude<FieldName, 'turnstileToken'>) => (value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };
  return { values, setValue, captcha };
}

// Where the visitor is (number, code, done) and what the polite status line says about it.
function useOtpSteps(onVerified: PhoneOtpActions['onVerified']) {
  const [step, setStep] = useState<Step>({ name: 'contact', channel: 'whatsapp' });
  const [status, setStatus] = useState('');
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

  function onCodeVerified(answer: OtpVerifyAnswer, phone: string) {
    setStep({ name: 'verified', channel: answer.channel });
    setStatus(answer.channel === 'email' ? text.verifiedEmail : text.verifiedWhatsapp);
    onVerified?.({ ...answer, phone });
  }

  return { step, setStep, status, cooldown, onCodeSent, onCodeVerified };
}

export function usePhoneOtp({ requestAction, verifyAction, onVerified }: PhoneOtpActions) {
  const steps = useOtpSteps(onVerified);
  const { values, setValue, captcha } = useOtpValues();
  const action = useActionRun();

  const contactFor = (channel: OtpChannel) => ({
    channel,
    phone: values.phone,
    email: channel === 'email' ? values.email : null,
  });

  // A Turnstile token is good once, so every request, answered or refused, is followed by a fresh one.
  async function sendCode(channel: OtpChannel) {
    const request = { ...contactFor(channel), turnstileToken: values.turnstileToken };
    await action.run(() => requestAction(request), steps.onCodeSent);
    captcha.renew();
  }

  // The code is checked against the one this browser asked for, for the same contact.
  async function verifyCode(channel: OtpChannel) {
    const check = { ...contactFor(channel), code: values.code };
    await action.run(
      () => verifyAction(check),
      (answer) => {
        steps.onCodeVerified(answer, values.phone);
      },
    );
  }

  return { ...steps, values, setValue, action, captcha, sendCode, verifyCode };
}

export type PhoneOtp = ReturnType<typeof usePhoneOtp>;
