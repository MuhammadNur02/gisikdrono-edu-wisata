'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { TotpCodeField } from '@/components/auth/totp-code-field';
import { TotpQrCode } from '@/components/auth/totp-qr-code';
import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useActionForm } from '@/hooks/use-action-form';
import { useReplaceNavigation } from '@/hooks/use-replace-navigation';
import { copy } from '@/lib/copy/id';
import { confirmMfaEnrolmentSchema } from '@/lib/validations/mfa';
import type { ActionResult } from '@/types/action-result';
import type { NextStep, TotpEnrolment } from '@/types/auth';

const text = copy.auth.mfa;
// Authenticator apps ignore spaces in a typed key, and groups of four are easier to copy by eye.
const SECRET_GROUP = /.{1,4}/g;

export interface MfaEnrolFormProps {
  // startMfaEnrolmentAction and confirmMfaEnrolmentAction, handed in by the page.
  startAction: () => Promise<ActionResult<TotpEnrolment>>;
  confirmAction: (values: unknown) => Promise<ActionResult<NextStep>>;
  next?: string | undefined;
}

interface EnrolmentStartProps {
  action: MfaEnrolFormProps['startAction'];
  notice: string | null;
  onStarted: (enrolment: TotpEnrolment) => void;
}

// The QR code is made only when asked for, so opening the page does not leave a pending factor behind.
function EnrolmentStart({ action, notice, onStarted }: EnrolmentStartProps) {
  const [failure, setFailure] = useState<string | null>(null);
  const [isStarting, startTransition] = useTransition();
  const start = () => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) onStarted(result.data);
      else setFailure(result.error.message);
    });
  };
  const message = failure ?? notice;
  return (
    <div className="space-y-5">
      {message ? <FormAlert tone="danger">{message}</FormAlert> : null}
      <Button type="button" size="lg" className="w-full" loading={isStarting} onClick={start}>
        {text.enrollStart}
      </Button>
    </div>
  );
}

function ManualSecret({ secret }: { secret: string }) {
  return (
    <div className="space-y-2">
      <p className="text-caption text-muted-foreground">{text.secretLabel}</p>
      <code className="block rounded-lg bg-muted px-3 py-2 font-mono text-body-sm break-all select-all">
        {(secret.match(SECRET_GROUP) ?? []).join(' ')}
      </code>
    </div>
  );
}

function EnrolmentInstructions({ enrolment }: { enrolment: TotpEnrolment }) {
  return (
    <>
      <p className="text-body-sm">{text.enrollScan}</p>
      <TotpQrCode qr={enrolment.qr} />
      <ManualSecret secret={enrolment.secret} />
    </>
  );
}

interface EnrolmentConfirmProps {
  enrolment: TotpEnrolment;
  action: MfaEnrolFormProps['confirmAction'];
  next: string | undefined;
  onExpired: (message: string) => void;
}

function EnrolmentConfirm({ enrolment, action, next, onExpired }: EnrolmentConfirmProps) {
  const { isNavigating, navigate } = useReplaceNavigation();
  const form = useForm({
    resolver: zodResolver(confirmMfaEnrolmentSchema),
    defaultValues: { factorId: enrolment.factorId, code: '', next },
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['code'],
    onSuccess: ({ redirectTo }) => {
      navigate(redirectTo);
    },
    onFailure: (error) => {
      if (error.code === 'STATE_INVALID') onExpired(error.message);
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
        <EnrolmentInstructions enrolment={enrolment} />
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <TotpCodeField control={form.control} name="code" />
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={form.formState.isSubmitting || isNavigating}
        >
          {text.enrollSubmit}
        </Button>
      </form>
    </Form>
  );
}

// Task P2.8.02: the account's first factor, QR code and first code in one flow.
export function MfaEnrolForm({ startAction, confirmAction, next }: MfaEnrolFormProps) {
  const [enrolment, setEnrolment] = useState<TotpEnrolment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (!enrolment) {
    return (
      <EnrolmentStart
        action={startAction}
        notice={notice}
        onStarted={(started) => {
          setNotice(null);
          setEnrolment(started);
        }}
      />
    );
  }
  return (
    <EnrolmentConfirm
      enrolment={enrolment}
      action={confirmAction}
      next={next}
      onExpired={(message) => {
        setNotice(message);
        setEnrolment(null);
      }}
    />
  );
}
