'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

import { EvidenceField } from '@/components/admin/finance/evidence-field';
import { OptionSelect, type Option } from '@/components/admin/finance/option-select';
import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { MoneyInput } from '@/components/forms/money-input';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useActionForm } from '@/hooks/use-action-form';
import { adjustmentsCopy } from '@/lib/copy/finance-adjustments';
import { staffCopy } from '@/lib/copy/staff';
import { formatIDR } from '@/lib/utils/currency';
import { partyLabel } from '@/lib/utils/finance-display';
import { PROPOSABLE_ADJUSTMENTS, proposeAdjustmentFormSchema } from '@/lib/validations/finance';
import type { ActionResult } from '@/types/action-result';
import type { FinanceBooking } from '@/types/finance';

// Task P4.7.04 (docs/Security.md §3.8): an adjustment of one booking, with its evidence and the authenticator code. The
// options come from the booking's own payments and ledger lines as finance_booking read them; the RPC checks the terms
// again (REFUND_TOO_LARGE, SHARE_TOO_LARGE).

const text = adjustmentsCopy;
type ProposeInput = z.input<typeof proposeAdjustmentFormSchema>;
type ProposeValues = z.output<typeof proposeAdjustmentFormSchema>;
type ProposeForm = UseFormReturn<ProposeInput, unknown, ProposeValues>;

const TYPE_OPTIONS: Option[] = PROPOSABLE_ADJUSTMENTS.map((type) => ({ value: type, label: text.types[type] }));
const REFUNDABLE = new Set(['settled', 'partially_refunded', 'duplicate']);

export interface ProposeFormProps {
  booking: FinanceBooking;
  submit: (values: unknown) => Promise<ActionResult<unknown>>;
  onDone: () => void;
}

function paymentOptions(booking: FinanceBooking): Option[] {
  return booking.payments
    .filter((payment) => REFUNDABLE.has(payment.status) && payment.grossAmount > payment.refundedAmount)
    .map((payment) => ({
      value: payment.id,
      label: text.paymentOption(payment.orderId, formatIDR(payment.grossAmount - payment.refundedAmount)),
    }));
}

function SelectField({ form, name, label, options }: {
  form: ProposeForm;
  name: 'type' | 'paymentId' | 'lineRef' | 'fromKey' | 'toKey';
  label: string;
  options: readonly Option[];
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      label={label}
      required
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value ?? ''}
          onChange={field.onChange}
          options={options}
          placeholder={text.lookup.find}
          trigger={field}
        />
      )}
    />
  );
}

function MoveFields({ form, booking }: { form: ProposeForm; booking: FinanceBooking }) {
  const lineRef = form.watch('lineRef');
  const lineRefs = [...new Set(booking.ledger.map((line) => line.lineRef))];
  const parties = booking.ledger
    .filter((line) => line.lineRef === lineRef)
    .map((line) => ({ value: line.beneficiaryKey, label: text.lineOption(line.lineRef, partyLabel(line.beneficiaryKey, null), formatIDR(line.amount)) }));
  return (
    <>
      <SelectField form={form} name="lineRef" label={text.fields.line}
        options={lineRefs.map((ref) => ({ value: ref, label: ref }))} />
      <SelectField form={form} name="fromKey" label={text.fields.fromKey} options={parties} />
      <SelectField form={form} name="toKey" label={text.fields.toKey} options={parties} />
    </>
  );
}

function TermsFields({ form }: { form: ProposeForm }) {
  return (
    <>
      <FormField
        control={form.control}
        name="amount"
        label={text.fields.amount}
        required
        render={(field) => (
          <MoneyInput
            {...field}
            value={Number.isFinite(field.value) ? field.value : null}
            onChange={(value) => {
              field.onChange(value ?? Number.NaN);
            }}
          />
        )}
      />
      <FormField
        control={form.control}
        name="reason"
        label={text.fields.reason}
        description={text.fields.reasonHint}
        required
        render={(field) => <Textarea {...field} rows={3} />}
      />
      <EvidenceField
        label={text.fields.evidence}
        error={form.formState.errors.evidenceUpload?.message}
        onUploaded={(path) => {
          form.setValue('evidenceUpload', path, { shouldValidate: true });
        }}
      />
    </>
  );
}

export function ProposeForm({ booking, submit: action, onDone }: ProposeFormProps) {
  const form = useForm<ProposeInput, unknown, ProposeValues>({
    resolver: zodResolver(proposeAdjustmentFormSchema),
    defaultValues: {
      type: 'manual_refund', bookingId: booking.id, paymentId: null, amount: Number.NaN, reason: '',
      lineRef: null, fromKey: null, toKey: null, evidenceUpload: '', code: '',
    },
  });
  const fields = ['type', 'paymentId', 'amount', 'reason', 'lineRef', 'fromKey', 'toKey', 'evidenceUpload', 'code'] as const;
  const { submit, failure } = useActionForm({ form, action, fields, onSuccess: onDone });
  const type = form.watch('type');
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <SelectField form={form} name="type" label={text.fields.type} options={TYPE_OPTIONS} />
        {type === 'manual_refund' ? (
          <SelectField form={form} name="paymentId" label={text.fields.payment} options={paymentOptions(booking)} />
        ) : null}
        {type === 'reclassify_share' ? <MoveFields form={form} booking={booking} /> : null}
        <TermsFields form={form} />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {text.submitPropose}
        </Button>
      </PostForm>
    </Form>
  );
}
