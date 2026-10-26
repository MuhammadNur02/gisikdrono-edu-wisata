'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { SelectField, TextField } from '@/components/admin/cms/fields';
import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { useActionForm } from '@/hooks/use-action-form';
import { dsrCopy } from '@/lib/copy/dsr';
import { staffCopy } from '@/lib/copy/staff';
import type { DsrFinishStep } from '@/lib/utils/dsr-steps';
import { withStepUp } from '@/lib/utils/step-up';
import { closeDsrSchema, dsrFinishFormSchema, openDsrSchema } from '@/lib/validations/dsr';
import type { ActionResult } from '@/types/action-result';
import { DSR_REQUEST_TYPES, type DsrCloseOutcome, type DsrStepAnswer } from '@/types/dsr';

// The superadmin's dialogs of the data-request queue (Task P4.10.03; docs/StyleGuide.md §5.3): each names its
// consequence, asks for its text, and the destructive steps ask for the authenticator code too.

const text = dsrCopy.staff;
const TEXT_MAX_LENGTH = 2000;

export type DsrAction = (values: unknown) => Promise<ActionResult<DsrStepAnswer>>;
export type DsrStepUpAction = (values: unknown) => Promise<ActionResult<null>>;

function DialogShell(props: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      title={props.title}
      description={props.description}
      size="form"
    >
      <div className="pb-4">{props.children}</div>
    </ResponsiveDialog>
  );
}

// The toast says whether the guest's message was queued; the booking is read again either way.
function useDoneHandler(onClose: () => void, messages: { sent: string; notSent: string }) {
  const router = useRouter();
  return (answer: DsrStepAnswer) => {
    if (answer.isGuestNotified) toast.success(messages.sent);
    else toast.warning(messages.notSent);
    onClose();
    router.refresh();
  };
}

const DONE = { sent: text.done, notSent: text.doneNotNotified };
const REQUEST_TYPE_OPTIONS = DSR_REQUEST_TYPES.map((value) => ({
  value,
  label: dsrCopy.requestTypes[value],
}));

interface OpenDsrDialogProps {
  bookingId: string;
  action: DsrAction;
  onClose: () => void;
}

function useOpenDsrForm(props: OpenDsrDialogProps) {
  const form = useForm({
    resolver: zodResolver(openDsrSchema),
    defaultValues: { bookingId: props.bookingId, requestType: 'access' as const, reason: '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action: props.action,
    fields: ['requestType', 'reason'],
    onSuccess: useDoneHandler(props.onClose, {
      sent: text.opened,
      notSent: text.openedNotNotified,
    }),
  });
  return { form, submit, failure };
}

export function OpenDsrDialog(props: OpenDsrDialogProps) {
  const { form, submit, failure } = useOpenDsrForm(props);
  return (
    <DialogShell title={text.openTitle} description={text.openDescription} onClose={props.onClose}>
      <Form {...form}>
        <PostForm onSubmit={submit}>
          {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
          <SelectField
            control={form.control}
            name="requestType"
            label={text.requestType}
            options={REQUEST_TYPE_OPTIONS}
            required
          />
          <TextField
            control={form.control}
            name="reason"
            label={text.reason}
            description={text.reasonHint}
            maxLength={TEXT_MAX_LENGTH}
            multiline
            required
          />
          <Button type="submit" className="min-h-11 w-full" loading={form.formState.isSubmitting}>
            {text.submitOpen}
          </Button>
        </PostForm>
      </Form>
    </DialogShell>
  );
}

const FINISH_TEXT: Record<DsrFinishStep, { title: string; description: string }> = {
  export: { title: text.export, description: text.exportDescription },
  deleteParticipants: {
    title: text.deleteParticipants,
    description: text.deleteParticipantsDescription,
  },
  anonymise: { title: text.anonymise, description: text.anonymiseDescription },
};

export interface FinishDsrDialogProps {
  bookingId: string;
  requestId: string;
  step: DsrFinishStep;
  action: DsrAction;
  // verifyStaffTotpAction: the code is checked first, so the RPC sees a fresh one (docs/Security.md §5.3).
  stepUpAction: DsrStepUpAction;
  onClose: () => void;
}

export function FinishDsrDialog(props: FinishDsrDialogProps) {
  const form = useForm({
    resolver: zodResolver(dsrFinishFormSchema),
    defaultValues: { bookingId: props.bookingId, requestId: props.requestId, note: '', code: '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action: withStepUp(props.stepUpAction, props.action),
    fields: ['note', 'code'],
    onSuccess: useDoneHandler(props.onClose, DONE),
  });
  const copyOf = FINISH_TEXT[props.step];
  return (
    <DialogShell title={copyOf.title} description={copyOf.description} onClose={props.onClose}>
      <Form {...form}>
        <PostForm onSubmit={submit}>
          {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
          <TextField
            control={form.control}
            name="note"
            label={text.note}
            description={text.noteHint}
            maxLength={TEXT_MAX_LENGTH}
            multiline
            required
          />
          <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
          <Button
            type="submit"
            variant={props.step === 'export' ? 'default' : 'destructive'}
            className="min-h-11 w-full"
            loading={form.formState.isSubmitting}
          >
            {copyOf.title}
          </Button>
        </PostForm>
      </Form>
    </DialogShell>
  );
}

export interface CloseDsrDialogProps {
  bookingId: string;
  requestId: string;
  outcomes: readonly DsrCloseOutcome[];
  action: DsrAction;
  onClose: () => void;
}

function useCloseDsrForm(props: CloseDsrDialogProps) {
  const form = useForm({
    resolver: zodResolver(closeDsrSchema),
    defaultValues: {
      bookingId: props.bookingId,
      requestId: props.requestId,
      outcome: props.outcomes[0] ?? 'rejected_other',
      note: '',
    },
  });
  const { submit, failure } = useActionForm({
    form,
    action: props.action,
    fields: ['outcome', 'note'],
    onSuccess: useDoneHandler(props.onClose, DONE),
  });
  return { form, submit, failure };
}

export function CloseDsrDialog(props: CloseDsrDialogProps) {
  const { form, submit, failure } = useCloseDsrForm(props);
  const options = props.outcomes.map((value) => ({ value, label: dsrCopy.outcomes[value] }));
  return (
    <DialogShell title={text.close} description={text.closeDescription} onClose={props.onClose}>
      <Form {...form}>
        <PostForm onSubmit={submit}>
          {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
          <SelectField
            control={form.control}
            name="outcome"
            label={text.outcome}
            options={options}
            required
          />
          <TextField
            control={form.control}
            name="note"
            label={text.note}
            description={text.noteHint}
            maxLength={TEXT_MAX_LENGTH}
            multiline
            required
          />
          <Button
            type="submit"
            variant="outline"
            className="min-h-11 w-full"
            loading={form.formState.isSubmitting}
          >
            {text.close}
          </Button>
        </PostForm>
      </Form>
    </DialogShell>
  );
}
