'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

import { EvidenceField } from '@/components/admin/finance/evidence-field';
import { OptionSelect, type Option } from '@/components/admin/finance/option-select';
import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PAYOUT_ACCOUNT_DIGITS, PAYOUT_REFERENCE_MAX_LENGTH } from '@/config/finance';
import { useActionForm } from '@/hooks/use-action-form';
import { financeCopy } from '@/lib/copy/finance';
import { staffCopy } from '@/lib/copy/staff';
import { settlePayoutFormSchema } from '@/lib/validations/finance';
import type { ActionResult } from '@/types/action-result';
import type { PayoutBatch } from '@/types/finance';

// Task P4.7.02 (docs/Security.md REC-10, PAY-16): a payout to one party for the ledger rows of a period, with the
// transfer's reference, its proof, the last four digits of the payout account the Midtrans dashboard shows, and the
// authenticator code. The server compares the digits with site_settings before anything is written.

const text = financeCopy.payouts;
type PayoutInput = z.input<typeof settlePayoutFormSchema>;
type PayoutValues = z.output<typeof settlePayoutFormSchema>;
type PayoutForm = UseFormReturn<PayoutInput, unknown, PayoutValues>;

export interface PayoutFormProps {
  parties: readonly Option[];
  today: string;
  periodStart: string;
  submit: (values: unknown) => Promise<ActionResult<PayoutBatch>>;
  onDone: (batch: PayoutBatch) => void;
}

function PeriodFields({ form, today }: { form: PayoutForm; today: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FormField
        control={form.control}
        name="from"
        label={text.fields.from}
        required
        render={(field) => <Input {...field} type="date" max={today} className="h-11" />}
      />
      <FormField
        control={form.control}
        name="to"
        label={text.fields.to}
        required
        render={(field) => <Input {...field} type="date" max={today} className="h-11" />}
      />
    </div>
  );
}

function TransferFields({ form }: { form: PayoutForm }) {
  return (
    <>
      <FormField
        control={form.control}
        name="reference"
        label={text.fields.reference}
        required
        render={(field) => <Input {...field} maxLength={PAYOUT_REFERENCE_MAX_LENGTH} className="h-11" />}
      />
      <FormField
        control={form.control}
        name="accountDigits"
        label={text.fields.accountDigits}
        required
        render={(field) => (
          <Input {...field} inputMode="numeric" maxLength={PAYOUT_ACCOUNT_DIGITS} className="h-11 w-32 tabular-nums" />
        )}
      />
      <EvidenceField
        label={text.fields.proof}
        error={form.formState.errors.proofUpload?.message}
        onUploaded={(path) => {
          form.setValue('proofUpload', path, { shouldValidate: true });
        }}
      />
    </>
  );
}

export function PayoutForm({ parties, today, periodStart, submit: action, onDone }: PayoutFormProps) {
  const form = useForm<PayoutInput, unknown, PayoutValues>({
    resolver: zodResolver(settlePayoutFormSchema),
    defaultValues: { beneficiaryKey: '', from: periodStart, to: today, reference: '', accountDigits: '', proofUpload: '', code: '' },
  });
  const fields = ['beneficiaryKey', 'from', 'to', 'reference', 'accountDigits', 'proofUpload', 'code'] as const;
  const { submit, failure } = useActionForm({ form, action, fields, onSuccess: onDone });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="beneficiaryKey"
          label={text.fields.party}
          required
          wrapsOwnControl
          render={(field) => (
            <OptionSelect
              value={field.value}
              onChange={field.onChange}
              options={parties}
              placeholder={financeCopy.rules.placeholders.choose}
              trigger={field}
            />
          )}
        />
        <PeriodFields form={form} today={today} />
        <TransferFields form={form} />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {text.submit}
        </Button>
      </PostForm>
    </Form>
  );
}
