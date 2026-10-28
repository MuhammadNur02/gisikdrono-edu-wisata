'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { OptionSelect } from '@/components/admin/finance/option-select';
import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { CANCEL_REASON_LIMITS, STAFF_CANCEL_CATEGORIES } from '@/config/bookings';
import { useActionForm } from '@/hooks/use-action-form';
import { bookingStaffCopy } from '@/lib/copy/booking-staff';
import { staffCopy } from '@/lib/copy/staff';
import { formatIDR } from '@/lib/utils/currency';
import { withStepUp } from '@/lib/utils/step-up';
import { cancelBookingFormSchema } from '@/lib/validations/booking-staff';
import type { ActionResult } from '@/types/action-result';

const text = bookingStaffCopy.cancel;

type StaffCategory = (typeof STAFF_CANCEL_CATEGORIES)[number];
type StepAction = (input: unknown) => Promise<ActionResult<null>>;
export interface CancellationPreview {
  amount: number;
  refundPct: number | null;
}
export type PreviewAction = (input: unknown) => Promise<ActionResult<CancellationPreview>>;

export interface CancelBookingFormProps {
  bookingId: string;
  // A paid booking's cancellation names its reason category (docs/PRD.md §13.1 A28).
  isPaid: boolean;
  action: StepAction;
  stepUpAction: StepAction;
  previewAction: PreviewAction;
  onDone: () => void;
}

const CATEGORY_OPTIONS = STAFF_CANCEL_CATEGORIES.map((category) => ({
  value: category,
  label: text.categories[category],
}));

// The refund the database would give for the chosen category, read again whenever it changes.
function useRefundPreview(props: CancelBookingFormProps, category: StaffCategory | null) {
  const [preview, setPreview] = useState<CancellationPreview | null>(null);
  const { bookingId, isPaid, previewAction } = props;
  useEffect(() => {
    if (isPaid && category === null) return;
    let isCurrent = true;
    void previewAction({ bookingId, reasonCategory: category }).then((result) => {
      if (isCurrent) setPreview(result.ok ? result.data : null);
    });
    return () => {
      isCurrent = false;
    };
  }, [bookingId, isPaid, category, previewAction]);
  return isPaid && category === null ? null : preview;
}

function RefundNote({ preview }: { preview: CancellationPreview | null }) {
  if (preview === null) return <FormAlert tone="info">{text.previewLoading}</FormAlert>;
  if (preview.amount === 0) return <FormAlert tone="info">{text.refundNone}</FormAlert>;
  return (
    <FormAlert tone="info">{text.refundOf(formatIDR(preview.amount), preview.refundPct)}</FormAlert>
  );
}

function useCancelForm(props: CancelBookingFormProps) {
  const form = useForm({
    resolver: zodResolver(cancelBookingFormSchema),
    defaultValues: {
      bookingId: props.bookingId,
      reason: '',
      reasonCategory: null,
      expectedAmount: 0,
      expectedPct: null,
      code: '',
    },
  });
  const preview = useRefundPreview(props, form.watch('reasonCategory'));
  useEffect(() => {
    form.setValue('expectedAmount', preview?.amount ?? 0);
    form.setValue('expectedPct', preview?.refundPct ?? null);
  }, [form, preview]);
  const { submit, failure } = useActionForm({
    form,
    action: withStepUp(props.stepUpAction, props.action),
    fields: ['reason', 'reasonCategory', 'code'],
    onSuccess: props.onDone,
  });
  return { form, preview, submit, failure };
}

type CancelForm = ReturnType<typeof useCancelForm>['form'];

function CategoryField({ form }: { form: CancelForm }) {
  return (
    <FormField
      control={form.control}
      name="reasonCategory"
      label={text.category}
      required
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value ?? ''}
          onChange={field.onChange}
          options={CATEGORY_OPTIONS}
          placeholder={text.category}
          trigger={field}
        />
      )}
    />
  );
}

export function CancelBookingForm(props: CancelBookingFormProps) {
  const { form, preview, submit, failure } = useCancelForm(props);
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        {props.isPaid ? <CategoryField form={form} /> : null}
        <RefundNote preview={preview} />
        <FormField
          control={form.control}
          name="reason"
          label={text.reason}
          required
          render={(field) => <Textarea {...field} rows={3} maxLength={CANCEL_REASON_LIMITS.max} />}
        />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <Button
          type="submit"
          variant="destructive"
          className="min-h-11 w-full"
          loading={form.formState.isSubmitting}
          disabled={preview === null}
        >
          {text.submit}
        </Button>
      </PostForm>
    </Form>
  );
}
