'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { OptionSelect } from '@/components/admin/finance/option-select';
import { ResponsiveSheet } from '@/components/admin/shell/responsive-sheet';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { RESCHEDULE_REASON_LIMITS } from '@/config/bookings';
import { useActionForm } from '@/hooks/use-action-form';
import { bookingStaffCopy } from '@/lib/copy/booking-staff';
import { rescheduleBookingFormSchema } from '@/lib/validations/booking-staff';
import type { ActionResult } from '@/types/action-result';
import type { RescheduleLeg } from '@/types/booking-staff';

// An officer's reschedule (20261114080000): one leg of a paid booking to another open session of its RW. The RPC
// checks the session, the day, the moves left and the weather notice again.

const text = bookingStaffCopy.reschedule;

type StepAction = (input: unknown) => Promise<ActionResult<null>>;

export interface RescheduleBookingFormProps {
  bookingId: string;
  legs: RescheduleLeg[];
  movesLeft: number;
  action: StepAction;
  onDone: () => void;
}

function useRescheduleForm(props: RescheduleBookingFormProps) {
  const form = useForm({
    resolver: zodResolver(rescheduleBookingFormSchema),
    defaultValues: {
      bookingId: props.bookingId,
      legRwId: String(props.legs[0]?.rwId ?? ''),
      sessionId: '',
      reason: '',
    },
  });
  const { submit, failure } = useActionForm({
    form,
    // The leg only picks which sessions show; the session names the leg to the RPC.
    action: () => {
      const { bookingId, sessionId, reason } = form.getValues();
      return props.action({ bookingId, sessionId, reason });
    },
    fields: ['sessionId', 'reason'],
    onSuccess: props.onDone,
  });
  return { form, submit, failure };
}

type RescheduleForm = ReturnType<typeof useRescheduleForm>['form'];

function LegField({ form, legs }: { form: RescheduleForm; legs: RescheduleLeg[] }) {
  if (legs.length <= 1) return null;
  const options = legs.map((leg) => ({ value: String(leg.rwId), label: leg.label }));
  return (
    <FormField
      control={form.control}
      name="legRwId"
      label={text.leg}
      required
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value}
          onChange={(value) => {
            field.onChange(value);
            form.setValue('sessionId', '');
          }}
          options={options}
          placeholder={text.leg}
          trigger={field}
        />
      )}
    />
  );
}

function SessionField({ form, leg }: { form: RescheduleForm; leg: RescheduleLeg | undefined }) {
  const sessions = leg?.sessions ?? [];
  return (
    <FormField
      control={form.control}
      name="sessionId"
      label={text.session}
      description={sessions.length === 0 ? text.noSessions : leg?.label}
      required
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value}
          onChange={field.onChange}
          options={sessions}
          placeholder={text.sessionPlaceholder}
          trigger={field}
          disabled={sessions.length === 0}
        />
      )}
    />
  );
}

export function RescheduleBookingForm(props: RescheduleBookingFormProps) {
  const { form, submit, failure } = useRescheduleForm(props);
  const legRwId = form.watch('legRwId');
  const leg = props.legs.find((each) => String(each.rwId) === legRwId);
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        <FormAlert tone="info">
          {text.description} {text.movesLeft(props.movesLeft)}
        </FormAlert>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <LegField form={form} legs={props.legs} />
        <SessionField form={form} leg={leg} />
        <FormField
          control={form.control}
          name="reason"
          label={text.reason}
          description={text.reasonHint}
          required
          render={(field) => (
            <Textarea {...field} rows={3} maxLength={RESCHEDULE_REASON_LIMITS.max} />
          )}
        />
        <Button type="submit" className="min-h-11 w-full" loading={form.formState.isSubmitting}>
          {text.submit}
        </Button>
      </PostForm>
    </Form>
  );
}

// The "Ganti jadwal" sheet of the staff actions card, loaded only when the booking offers the step.
export function RescheduleSheet({
  open,
  bookingCode,
  onClose,
  ...form
}: RescheduleBookingFormProps & { open: boolean; bookingCode: string; onClose: () => void }) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      title={text.title(bookingCode)}
    >
      <RescheduleBookingForm {...form} />
    </ResponsiveSheet>
  );
}
