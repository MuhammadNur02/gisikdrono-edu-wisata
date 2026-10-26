'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useActionForm } from '@/hooks/use-action-form';
import { staffCopy } from '@/lib/copy/staff';
import { walkInCopy } from '@/lib/copy/walk-in';
import { formatIDR } from '@/lib/utils/currency';
import { withStepUp } from '@/lib/utils/step-up';
import { recordCashFormSchema } from '@/lib/validations/walk-in';
import type { ActionResult } from '@/types/action-result';
import type { WalkInBooking } from '@/types/walk-in';

const text = walkInCopy;

type CashAction = (input: unknown) => Promise<ActionResult<null>>;

export interface WalkInCashFormProps {
  booking: WalkInBooking;
  action: CashAction;
  // verifyStaffTotpAction: the code is checked first, so mark_booking_paid_manually sees a fresh one (docs/Security.md
  // §5.3).
  stepUpAction: CashAction;
  onRecorded: () => void;
  onLater: () => void;
}

// The cash the officer took for the booking just made: its whole total, which the server compares with the booking's.
function useCashForm({ booking, action, stepUpAction, onRecorded }: WalkInCashFormProps) {
  const form = useForm({
    resolver: zodResolver(recordCashFormSchema),
    defaultValues: {
      bookingId: booking.bookingId,
      amount: booking.totalAmount,
      reference: '',
      code: '',
    },
  });
  const { submit, failure } = useActionForm({
    form,
    action: withStepUp(stepUpAction, action),
    fields: ['reference', 'code'],
    onSuccess: onRecorded,
  });
  return { form, submit, failure };
}

export function WalkInCashForm(props: WalkInCashFormProps) {
  const { booking, onLater } = props;
  const { form, submit, failure } = useCashForm(props);
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        <FormAlert tone="info">{text.cashDescription(formatIDR(booking.totalAmount))}</FormAlert>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="reference"
          label={text.cashReference}
          render={(field) => <Input {...field} autoComplete="off" maxLength={100} />}
        />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="submit" className="min-h-11 flex-1" loading={form.formState.isSubmitting}>
            {text.cashSubmit}
          </Button>
          <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={onLater}>
            {text.cashLater}
          </Button>
        </div>
      </PostForm>
    </Form>
  );
}
