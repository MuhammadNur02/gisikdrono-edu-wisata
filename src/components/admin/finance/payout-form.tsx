'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

import { EvidenceField } from '@/components/admin/finance/evidence-field';
import { OptionSelect, type Option } from '@/components/admin/finance/option-select';
import { PayoutPreviewLine } from '@/components/admin/finance/payout-preview';
import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PAYOUT_ACCOUNT_DIGITS, PAYOUT_REFERENCE_MAX_LENGTH } from '@/config/finance';
import { useActionForm } from '@/hooks/use-action-form';
import { usePayoutPreview, type PreviewAction } from '@/hooks/use-payout-preview';
import { financeCopy } from '@/lib/copy/finance';
import { staffCopy } from '@/lib/copy/staff';
import { hasPayableTotal } from '@/lib/utils/finance-display';
import { settlePayoutFormSchema } from '@/lib/validations/finance';
import type { ActionResult } from '@/types/action-result';
import type { PayoutBatch } from '@/types/finance';

// Task P4.7.02 (docs/Security.md REC-10, PAY-16): a payout to one party for the ledger rows of a period, with the
// transfer's reference, its proof, the last four digits of the payout account the Midtrans dashboard shows, and the
// authenticator code. The server compares the digits with site_settings before anything is written. Review of PR #80,
// M-2: the period starts at the party's oldest unpaid day, the server's figure for it is shown before submitting, and
// the payout carries that figure, which must be what was transferred.

const text = financeCopy.payouts;
type PayoutInput = z.input<typeof settlePayoutFormSchema>;
type PayoutValues = z.output<typeof settlePayoutFormSchema>;
type PayoutForm = UseFormReturn<PayoutInput, unknown, PayoutValues>;

export interface PayoutFormProps {
  parties: readonly Option[];
  today: string;
  previewAction: PreviewAction;
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
        render={(field) => (
          <Input {...field} maxLength={PAYOUT_REFERENCE_MAX_LENGTH} className="h-11" />
        )}
      />
      <FormField
        control={form.control}
        name="accountDigits"
        label={text.fields.accountDigits}
        required
        render={(field) => (
          <Input
            {...field}
            inputMode="numeric"
            maxLength={PAYOUT_ACCOUNT_DIGITS}
            className="h-11 w-32 tabular-nums"
          />
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

function PartyField({ form, parties }: { form: PayoutForm; parties: readonly Option[] }) {
  return (
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
  );
}

function usePayoutForm(today: string) {
  return useForm<PayoutInput, unknown, PayoutValues>({
    resolver: zodResolver(settlePayoutFormSchema),
    defaultValues: {
      beneficiaryKey: '',
      from: today,
      to: today,
      expectedTotal: 0,
      reference: '',
      accountDigits: '',
      proofUpload: '',
      code: '',
    },
  });
}

// The server's answer fills the period of a party just chosen and the payout's expected total.
function previewCallbacks(form: PayoutForm) {
  return {
    onPeriod: (periodFrom: string, periodTo: string) => {
      form.setValue('from', periodFrom);
      form.setValue('to', periodTo);
    },
    onTotal: (total: number) => {
      form.setValue('expectedTotal', total);
    },
  };
}

const FIELDS = [
  'beneficiaryKey',
  'from',
  'to',
  'reference',
  'accountDigits',
  'proofUpload',
  'code',
] as const;

export function PayoutForm({
  parties,
  today,
  previewAction,
  submit: action,
  onDone,
}: PayoutFormProps) {
  const form = usePayoutForm(today);
  const [beneficiaryKey, from, to] = form.watch(['beneficiaryKey', 'from', 'to']);
  const preview = usePayoutPreview(
    { beneficiaryKey, from, to },
    previewAction,
    previewCallbacks(form),
  );
  const { submit, failure } = useActionForm({ form, action, fields: FIELDS, onSuccess: onDone });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <PartyField form={form} parties={parties} />
        <PeriodFields form={form} today={today} />
        <PayoutPreviewLine state={preview} />
        <TransferFields form={form} />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!hasPayableTotal(preview)}
          loading={form.formState.isSubmitting}
        >
          {text.submit}
        </Button>
      </PostForm>
    </Form>
  );
}
