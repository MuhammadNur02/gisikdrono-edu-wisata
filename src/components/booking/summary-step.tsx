'use client';

import Link from 'next/link';
import { useForm, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

import { PhoneOtpField } from '@/components/booking/phone-otp-field';
import { QuotePreviewPanel } from '@/components/booking/quote-preview-panel';
import { SummaryDetails } from '@/components/booking/summary-details';
import {
  HoldNotice,
  PaymentTrust,
  PayButton,
  PayMethods,
  QuoteButton,
  type SendState,
} from '@/components/booking/summary-send';
import {
  WizardPanel,
  WizardStepFrame,
  type WizardStepProps,
} from '@/components/booking/wizard-step-frame';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { TurnstileField } from '@/components/forms/turnstile-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { TURNSTILE_ACTIONS } from '@/config/auth';
import { INSTITUTION_BOOKER_TYPES, PHONE_PROOF_FRESH_SECONDS } from '@/config/booking';
import type { BookingStep } from '@/config/site';
import { useBookingSubmit, type SubmitNotice } from '@/hooks/use-booking-submit';
import { useNow } from '@/hooks/use-now';
import type { QuotePreviewState } from '@/hooks/use-quote-preview';
import { useTurnstileToken } from '@/hooks/use-turnstile-token';
import { copy } from '@/lib/copy/id';
import type { BookingDraft } from '@/lib/utils/booking-wizard';
import { schemaResolver } from '@/lib/utils/schema-resolver';
import { summaryStepSchema, type BookingMode } from '@/lib/validations/booking';
import type { WizardActions } from '@/types/booking';
import type { VerifiedContact } from '@/types/guest';
import type { BookableLeg } from '@/types/session';

const text = copy.booking.wizard.summary;
const MS_PER_SECOND = 1000;
// The re-verify check runs again while the visitor reads the summary.
const CLOCK_TICK_MS = 15_000;
const PRIVACY_PATH = '/privasi';

export interface SummaryStepProps extends WizardStepProps {
  actions: Pick<WizardActions, 'createBooking' | 'requestQuotation' | 'requestOtp' | 'verifyOtp'>;
  legs: readonly BookableLeg[];
  preview: QuotePreviewState;
  refreshPreview: () => void;
  onOpen: (step: BookingStep) => void;
  // After a booking is made: the draft goes and the browser opens its next page.
  onBooked: (nextUrl: string) => void;
  // After the link of a hold the visitor already has went to them again: the draft goes too.
  onResent: () => void;
}

// What the fields hold: the box starts unticked, and the schema wants it ticked.
interface SummaryFields {
  privacyAccepted: boolean;
  turnstileToken: string;
}

type SummaryForm = UseFormReturn<SummaryFields, unknown, z.output<typeof summaryStepSchema>>;

function PrivacyField({ form }: { form: SummaryForm }) {
  return (
    <FormField
      control={form.control}
      name="privacyAccepted"
      render={({ field }) => (
        <FormItem className="flex flex-row items-start gap-3 space-y-0">
          <FormControl aria-required>
            <Checkbox
              checked={field.value}
              onBlur={field.onBlur}
              onCheckedChange={(checked) => {
                field.onChange(checked === true);
              }}
            />
          </FormControl>
          <div className="space-y-1">
            <FormLabel className="block text-body leading-normal font-normal text-ink-2">
              {text.privacy}{' '}
              <Link
                href={PRIVACY_PATH}
                target="_blank"
                className="text-primary-text underline underline-offset-4"
              >
                {text.privacyLink}
              </Link>
            </FormLabel>
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  );
}

type ReverifyRequest = Pick<
  ReturnType<typeof useBookingSubmit>,
  'isAskedToReverify' | 'setIsAskedToReverify'
>;

// The contact proved again, as it stands. isAskedToReverify: the server found the code stale or of another contact
// than the one shown (review of PR #27, M1), rather than the clock passing eight minutes here.
function ReverifyPanel(
  props: Pick<SummaryStepProps, 'draft' | 'actions' | 'update'> & { request: ReverifyRequest },
) {
  const { draft, request } = props;
  const contact = draft.contact;
  if (!contact) return null;
  const onVerified = (verified: VerifiedContact) => {
    const { channel, phone, email } = verified;
    props.update({ contact: { channel, phone, email, verifiedAt: Date.now() } });
    request.setIsAskedToReverify(false);
  };
  return (
    <div className="space-y-3 rounded-2xl border border-warning bg-warning-soft/40 p-5 md:p-7">
      <p className="text-body-sm font-medium">{text.reverifyTitle}</p>
      <p className="text-caption">
        {request.isAskedToReverify ? text.reverifyAsked : text.reverify}
      </p>
      <PhoneOtpField
        requestAction={props.actions.requestOtp}
        verifyAction={props.actions.verifyOtp}
        fixedContact={{ phone: contact.phone, email: contact.email }}
        onVerified={onVerified}
      />
    </div>
  );
}

function useSummarySend(props: SummaryStepProps, form: SummaryForm, renewCaptcha: () => void) {
  const submit = useBookingSubmit({
    ...props,
    createBooking: props.actions.createBooking,
    requestQuotation: props.actions.requestQuotation,
    renewCaptcha,
  });
  const sendAs = (mode: BookingMode) => form.handleSubmit((summary) => submit.send(mode, summary));
  return { ...submit, sendAs };
}

// The end of the summary (DESIGN-SPEC §3.10 step 4): the privacy notice, the methods, the hold, the security check and,
// for an institution, the quotation.
function CheckAndSend(
  props: {
    form: SummaryForm;
    captcha: ReturnType<typeof useSummaryForm>['captcha'];
    canAskQuotation: boolean;
    onQuote: () => void;
  } & SendState,
) {
  const { form, captcha, canAskQuotation, onQuote, ...state } = props;
  return (
    <WizardPanel>
      <PrivacyField form={form} />
      <PayMethods />
      <HoldNotice />
      <TurnstileField
        ref={captcha.ref}
        action={TURNSTILE_ACTIONS.bookingCreate}
        onToken={captcha.onToken}
        error={form.formState.errors.turnstileToken?.message}
      />
      {canAskQuotation && <QuoteButton {...state} onQuote={onQuote} />}
    </WizardPanel>
  );
}

function useSummaryForm() {
  const form = useForm({
    resolver: schemaResolver<SummaryFields, z.output<typeof summaryStepSchema>>(summaryStepSchema),
    defaultValues: { privacyAccepted: false, turnstileToken: '' },
  });
  const captcha = useTurnstileToken((token) => {
    form.setValue('turnstileToken', token, { shouldValidate: token !== '' });
  });
  return { form, captcha };
}

// internal.create_booking takes a code at most ten minutes old: past eight the summary asks for it again, and so it
// does when the server answered reverify (decision of 2026-10-22 on P3.5, Q2).
function useNeedsReverify(draft: BookingDraft, isAskedToReverify: boolean): boolean {
  const now = useNow(CLOCK_TICK_MS);
  const isProofOld =
    draft.contact !== null &&
    now - draft.contact.verifiedAt > PHONE_PROOF_FRESH_SECONDS * MS_PER_SECOND;
  return isAskedToReverify || isProofOld;
}

function SendNotice({
  notice,
  onOpen,
}: {
  notice: SubmitNotice;
  onOpen: (step: BookingStep) => void;
}) {
  return (
    <FormAlert tone={notice.tone}>
      <p>{notice.message}</p>
      {notice.offersOtherSession && (
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() => {
            onOpen('jadwal');
          }}
        >
          {text.otherSession}
        </Button>
      )}
    </FormAlert>
  );
}

// Step ringkasan (docs/PRD.md FR-BOOK-05, Task P3.5.04): the booking as it will be sent, the server's quote, the
// privacy notice, the security check, and "Konfirmasi & Bayar", or for an institution "Minta Surat Penawaran" too.
function useSummaryStep(props: SummaryStepProps) {
  const { draft, preview } = props;
  const { form, captcha } = useSummaryForm();
  const send = useSummarySend(props, form, captcha.renew);
  const needsReverify = useNeedsReverify(draft, send.isAskedToReverify);
  const isInstitution = (INSTITUTION_BOOKER_TYPES as readonly (string | null)[]).includes(
    draft.bookerType,
  );
  const hasQuote = preview.status === 'ready' && preview.answer.kind === 'quote';
  const state: SendState = { isBusy: send.isBusy, isDisabled: !hasQuote || needsReverify };
  const canAskQuotation = isInstitution && draft.contact?.channel !== 'email';
  return { form, captcha, send, needsReverify, state, canAskQuotation };
}

export function SummaryStep(props: SummaryStepProps) {
  const { draft, wizardPackage, legs, preview, onOpen, onBack, update } = props;
  const { form, captcha, send, needsReverify, state, canAskQuotation } = useSummaryStep(props);
  return (
    <Form {...form}>
      <PostForm onSubmit={send.sendAs('pay')}>
        <WizardStepFrame
          title={text.title}
          description={text.description}
          onBack={onBack}
          backLabel={props.backLabel}
          actions={<PayButton {...state} />}
        >
          <SummaryDetails draft={draft} legs={legs} onOpen={onOpen} />
          <QuotePreviewPanel state={preview} wizardPackage={wizardPackage} note={text.priceNote} />
          {send.notice && <SendNotice notice={send.notice} onOpen={onOpen} />}
          {needsReverify && (
            <ReverifyPanel
              key={String(draft.contact?.verifiedAt)}
              draft={draft}
              actions={props.actions}
              update={update}
              request={send}
            />
          )}
          <CheckAndSend
            form={form}
            captcha={captcha}
            canAskQuotation={canAskQuotation}
            {...state}
            onQuote={() => void send.sendAs('quote')()}
          />
          <PaymentTrust />
        </WizardStepFrame>
      </PostForm>
    </Form>
  );
}
