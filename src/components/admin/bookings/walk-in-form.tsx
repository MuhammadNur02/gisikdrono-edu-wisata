'use client';

import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import {
  BookerTypeField,
  NotesField,
  PackageField,
  PaxField,
  TextInputField,
  TickField,
  type WalkInFields,
  type WalkInForm as WalkInFormApi,
} from '@/components/admin/bookings/walk-in-fields';
import {
  WalkInSessions,
  type WalkInSessionsAction,
} from '@/components/admin/bookings/walk-in-sessions';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useActionForm } from '@/hooks/use-action-form';
import { useWalkInQuote, type WalkInQuoteAction } from '@/hooks/use-walk-in-quote';
import { bookingWizardCopy } from '@/lib/copy/booking-wizard';
import { walkInCopy } from '@/lib/copy/walk-in';
import { formatIDR } from '@/lib/utils/currency';
import { MOBILE_PHONE_PATTERN } from '@/lib/utils/phone';
import { schemaResolver } from '@/lib/utils/schema-resolver';
import { createAdminBookingSchema, type CreateAdminBookingValues } from '@/lib/validations/booking';
import { normalizeInternationalPhone } from '@/lib/validations/normalize';
import type { ActionResult } from '@/types/action-result';
import type { WalkInBooking, WalkInPackage } from '@/types/walk-in';

const text = walkInCopy;
const booker = bookingWizardCopy.booker;

export interface WalkInActions {
  listSessions: WalkInSessionsAction;
  previewQuote: WalkInQuoteAction;
  create: (input: unknown) => Promise<ActionResult<WalkInBooking>>;
}

export interface WalkInFormProps {
  packages: readonly WalkInPackage[];
  maxPax: number;
  // A9: cash at the counter is an RW admin's; the superadmin's booking is paid through its link.
  canTakeCash: boolean;
  actions: WalkInActions;
  onCreated: (booking: WalkInBooking) => void;
}

// A session left unchosen reads as no sessions at all, so the schema names the field rather than one of its items.
const prepare = (values: WalkInFields) => ({
  ...values,
  visitSessionIds: values.visitSessionIds.includes('') ? [] : values.visitSessionIds,
});

function useWalkInForm({ maxPax, canTakeCash, actions, onCreated }: WalkInFormProps) {
  const form = useForm<WalkInFields, unknown, CreateAdminBookingValues>({
    resolver: schemaResolver<WalkInFields, CreateAdminBookingValues>(
      createAdminBookingSchema(maxPax),
      prepare,
    ),
    defaultValues: {
      packageId: '',
      visitSessionIds: [],
      pax: 1,
      bookerType: 'individual',
      institutionName: '',
      picName: '',
      picPhone: '',
      picEmail: '',
      notes: '',
      isPhoneConfirmed: false,
      isCashOnTheSpot: canTakeCash,
      consentAttested: false,
      idempotencyKey: crypto.randomUUID(),
      quoteHash: '',
    },
  });
  const { submit, failure } = useActionForm({
    form,
    action: actions.create,
    fields: [
      'packageId',
      'visitSessionIds',
      'pax',
      'picPhone',
      'picEmail',
      'picName',
      'institutionName',
    ],
    onSuccess: onCreated,
  });
  return { form, submit, failure };
}

// The server's quote of the group, kept in the form as the fingerprint the booking sends back (PRICE_MISMATCH).
function QuoteLine({ form, action }: { form: WalkInFormApi; action: WalkInQuoteAction }) {
  const [packageId, pax] = form.watch(['packageId', 'pax']);
  const quote = useWalkInQuote(action, packageId, pax);
  const hash =
    quote.status === 'ready' && quote.answer.kind === 'quote' ? quote.answer.quoteHash : '';
  useEffect(() => {
    form.setValue('quoteHash', hash);
  }, [form, hash]);
  if (quote.status === 'idle') return null;
  if (quote.status === 'loading')
    return <p className="text-body-sm text-muted-foreground">{text.quoteLoading}</p>;
  if (quote.status === 'failed') return <FormAlert tone="danger">{quote.message}</FormAlert>;
  if (quote.answer.kind === 'problem')
    return <FormAlert tone="info">{text.quoteProblem}</FormAlert>;
  return (
    <p className="flex items-baseline justify-between text-body font-semibold" aria-live="polite">
      <span>{text.total}</span>
      <span>{formatIDR(quote.answer.quote.total)}</span>
    </p>
  );
}

function SessionsField({ form, action }: { form: WalkInFormApi; action: WalkInSessionsAction }) {
  const [packageId, sessionIds] = form.watch(['packageId', 'visitSessionIds']);
  const onChange = useCallback(
    (ids: string[]) => {
      form.setValue('visitSessionIds', ids, { shouldValidate: form.formState.isSubmitted });
    },
    [form],
  );
  if (packageId === '') return null;
  return (
    <WalkInSessions
      packageId={packageId}
      action={action}
      value={sessionIds}
      onChange={onChange}
      error={form.formState.errors.visitSessionIds?.message}
    />
  );
}

// Review of PR #91, L6: an Indonesian number that is no mobile one gets no WhatsApp, so the officer hears so before
// relying on it.
function isIndonesianLandline(value: string): boolean {
  const phone = normalizeInternationalPhone(value);
  return phone !== null && phone.startsWith('+62') && !MOBILE_PHONE_PATTERN.test(phone);
}

function BookerFields({ form }: { form: WalkInFormApi }) {
  const isGroup = form.watch('bookerType') !== 'individual';
  const isLandline = isIndonesianLandline(form.watch('picPhone'));
  return (
    <>
      <BookerTypeField form={form} />
      {isGroup ? (
        <TextInputField form={form} name="institutionName" label={text.institutionName} required />
      ) : null}
      <TextInputField form={form} name="picName" label={booker.picNameLabel} required />
      <TextInputField
        form={form}
        name="picPhone"
        label={text.picPhone}
        description={text.picPhoneHint}
        type="tel"
        required
      />
      {isLandline ? <FormAlert tone="info">{text.phoneNotMobile}</FormAlert> : null}
      <TextInputField
        form={form}
        name="picEmail"
        label={booker.picEmailLabel}
        type="email"
        required
      />
      <NotesField form={form} />
    </>
  );
}

export function WalkInForm(props: WalkInFormProps) {
  const { form, submit, failure } = useWalkInForm(props);
  const isQuoted = form.watch('quoteHash') !== '';
  if (props.packages.length === 0) return <FormAlert tone="info">{text.noPackages}</FormAlert>;
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <PackageField form={form} packages={props.packages} />
        <SessionsField form={form} action={props.actions.listSessions} />
        <PaxField form={form} />
        <BookerFields form={form} />
        <TickField
          form={form}
          name="isPhoneConfirmed"
          label={text.phoneConfirmed}
          description={text.phoneConfirmedHint}
        />
        {props.canTakeCash ? (
          <TickField
            form={form}
            name="isCashOnTheSpot"
            label={text.cashOnTheSpot}
            description={text.cashOnTheSpotHint}
          />
        ) : null}
        <TickField form={form} name="consentAttested" label={text.consentAttested} />
        <QuoteLine form={form} action={props.actions.previewQuote} />
        <Button
          type="submit"
          className="min-h-11 w-full"
          disabled={!isQuoted}
          loading={form.formState.isSubmitting}
        >
          {text.submit}
        </Button>
      </PostForm>
    </Form>
  );
}
