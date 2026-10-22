'use client';

import Link from 'next/link';
import { useForm, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

import { PhoneOtpField } from '@/components/booking/phone-otp-field';
import { QuotePreviewPanel } from '@/components/booking/quote-preview-panel';
import { SummaryDetails } from '@/components/booking/summary-details';
import { WizardStepFrame, type WizardStepProps } from '@/components/booking/wizard-step-frame';
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
  actions: Pick<WizardActions, 'createBooking' | 'requestOtp' | 'verifyOtp'>;
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
            <FormLabel className="font-normal">
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
    props.update({ contact: { ...verified, verifiedAt: Date.now() } });
    request.setIsAskedToReverify(false);
  };
  return (
    <div className="space-y-3 rounded-xl border border-warning bg-warning-soft/40 p-4">
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

function SendButtons(props: {
  isInstitution: boolean;
  isBusy: boolean;
  isDisabled: boolean;
  onQuote: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={props.isBusy}
          disabled={props.isDisabled}
        >
          {text.pay}
        </Button>
        <p className="text-caption text-muted-foreground">{text.payHint}</p>
      </div>
      {props.isInstitution && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            disabled={props.isBusy || props.isDisabled}
            onClick={props.onQuote}
          >
            {text.quote}
          </Button>
          <p className="text-caption text-muted-foreground">{text.quoteHint}</p>
        </div>
      )}
    </div>
  );
}

function useSummarySend(props: SummaryStepProps, form: SummaryForm, renewCaptcha: () => void) {
  const submit = useBookingSubmit({
    ...props,
    createBooking: props.actions.createBooking,
    renewCaptcha,
  });
  const sendAs = (mode: BookingMode) => form.handleSubmit((summary) => submit.send(mode, summary));
  return { ...submit, sendAs };
}

// The end of the summary: the privacy notice, the security check, then the buttons (docs/StyleGuide.md §5.6).
function CheckAndSend(
  props: { form: SummaryForm; captcha: ReturnType<typeof useSummaryForm>['captcha'] } & Parameters<
    typeof SendButtons
  >[0],
) {
  const { form, captcha, ...buttons } = props;
  return (
    <>
      <PrivacyField form={form} />
      <TurnstileField
        ref={captcha.ref}
        action={TURNSTILE_ACTIONS.bookingCreate}
        onToken={captcha.onToken}
        error={form.formState.errors.turnstileToken?.message}
      />
      <SendButtons {...buttons} />
    </>
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
export function SummaryStep(props: SummaryStepProps) {
  const { draft, wizardPackage, legs, preview, onOpen, onBack, update } = props;
  const { form, captcha } = useSummaryForm();
  const send = useSummarySend(props, form, captcha.renew);
  const needsReverify = useNeedsReverify(draft, send.isAskedToReverify);
  const isInstitution = (INSTITUTION_BOOKER_TYPES as readonly (string | null)[]).includes(
    draft.bookerType,
  );
  const hasQuote = preview.status === 'ready' && preview.answer.kind === 'quote';
  return (
    <Form {...form}>
      <PostForm onSubmit={send.sendAs('pay')}>
        <WizardStepFrame title={text.title} onBack={onBack} actions={<span aria-hidden />}>
          <SummaryDetails draft={draft} legs={legs} onOpen={onOpen} />
          <QuotePreviewPanel state={preview} wizardPackage={wizardPackage} />
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
            isInstitution={isInstitution}
            isBusy={send.isBusy}
            isDisabled={!hasQuote || needsReverify}
            onQuote={() => void send.sendAs('quote')()}
          />
        </WizardStepFrame>
      </PostForm>
    </Form>
  );
}
