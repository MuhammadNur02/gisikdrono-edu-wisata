'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField as FieldController,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useActionForm } from '@/hooks/use-action-form';
import { staffCopy } from '@/lib/copy/staff';
import { walkInCopy } from '@/lib/copy/walk-in';
import { formatIDR } from '@/lib/utils/currency';
import { withStepUp } from '@/lib/utils/step-up';
import { attendeeBoundsOf } from '@/lib/validations/scanner';
import { CASH_PRESENT_FIELD, recordCashFormSchema } from '@/lib/validations/walk-in';
import type { ActionResult } from '@/types/action-result';
import type { CashBooking } from '@/types/walk-in';

const text = walkInCopy;

type CashAction = (input: unknown) => Promise<ActionResult<null>>;

export interface WalkInCashFormProps {
  booking: CashBooking;
  action: CashAction;
  // verifyStaffTotpAction: the code is checked first, so mark_booking_paid_manually sees a fresh one (docs/Security.md
  // §5.3).
  stepUpAction: CashAction;
  onRecorded: () => void;
  // "Bayar nanti (kirim tautan)" after a new booking, "Tutup" on the booking's page.
  laterLabel: string;
  onLater: () => void;
  // Delta review of PR #91, M-1: the PIC has a pay link open, which taking the cash ends.
  hasOpenPayLink?: boolean;
}

// The tick is the officer's confirmation in the form; the action takes the count alone.
function withoutTick(values: unknown): unknown {
  if (typeof values !== 'object' || values === null) return values;
  return Object.fromEntries(Object.entries(values).filter(([key]) => key !== CASH_PRESENT_FIELD));
}

function useCashForm(props: WalkInCashFormProps, hasSessionStarted: boolean) {
  const { booking } = props;
  const form = useForm({
    resolver: zodResolver(
      recordCashFormSchema(hasSessionStarted, attendeeBoundsOf(booking.paxCount).max),
    ),
    defaultValues: {
      bookingId: booking.bookingId,
      amount: booking.totalAmount,
      reference: '',
      attendeeCount: hasSessionStarted ? booking.paxCount : null,
      isPresent: false,
      code: '',
    },
  });
  const { submit, failure } = useActionForm({
    form,
    action: withStepUp(props.stepUpAction, (values) => props.action(withoutTick(values))),
    fields: ['reference', 'attendeeCount', 'code'],
    onSuccess: props.onRecorded,
  });
  return { form, submit, failure };
}

type CashForm = ReturnType<typeof useCashForm>['form'];

function PresentField({ form }: { form: CashForm }) {
  return (
    <FieldController
      control={form.control}
      name="isPresent"
      render={({ field }) => (
        <FormItem className="flex flex-row items-start gap-3 space-y-0">
          <FormControl>
            <Checkbox
              ref={field.ref}
              checked={field.value}
              onBlur={field.onBlur}
              onCheckedChange={(checked) => {
                field.onChange(checked === true);
              }}
              className="mt-0.5 size-6"
            />
          </FormControl>
          <div className="space-y-1">
            <FormLabel className="block text-body leading-normal font-normal">
              {text.present}
            </FormLabel>
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  );
}

// Delta review of PR #91, L-3 (docs/PRD.md §13.1 A23 addendum): cash after the session started is taken from a group
// that came, so the officer confirms it is here and counts it in; the same transaction checks the group in.
function AttendanceFields({ form, maxAttendees }: { form: CashForm; maxAttendees: number }) {
  return (
    <>
      <PresentField form={form} />
      <FormField
        control={form.control}
        name="attendeeCount"
        label={text.attendees}
        description={text.attendeesHint(maxAttendees)}
        required
        render={(field) => (
          <Input
            {...field}
            type="number"
            inputMode="numeric"
            min={1}
            max={maxAttendees}
            value={field.value ?? ''}
            onChange={(event) => {
              const count = event.target.valueAsNumber;
              field.onChange(Number.isNaN(count) ? null : count);
            }}
          />
        )}
      />
    </>
  );
}

export function WalkInCashForm(props: WalkInCashFormProps) {
  const { booking, onLater } = props;
  // Read once when the form opens; mark_booking_paid_manually decides again and says so if the session started since.
  const [hasSessionStarted] = useState(() => Date.now() >= Date.parse(booking.sessionStartsAt));
  const { form, submit, failure } = useCashForm(props, hasSessionStarted);
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        <FormAlert tone="info">{text.cashDescription(formatIDR(booking.totalAmount))}</FormAlert>
        {props.hasOpenPayLink ? <FormAlert tone="info">{text.openLinkNote}</FormAlert> : null}
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="reference"
          label={text.cashReference}
          render={(field) => <Input {...field} autoComplete="off" maxLength={100} />}
        />
        {hasSessionStarted ? (
          <AttendanceFields form={form} maxAttendees={attendeeBoundsOf(booking.paxCount).max} />
        ) : null}
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="submit" className="min-h-11 flex-1" loading={form.formState.isSubmitting}>
            {text.cashSubmit}
          </Button>
          <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={onLater}>
            {props.laterLabel}
          </Button>
        </div>
      </PostForm>
    </Form>
  );
}
