'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

import { OptionSelect, type Option } from '@/components/admin/finance/option-select';
import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RULE_MAX_LINES, RULE_PCT_DECIMALS, RULE_PCT_SCALE, RULE_TOTAL_PCT } from '@/config/finance';
import { DB_ENUMS } from '@/db/enums';
import { financeCopy } from '@/lib/copy/finance';
import { numberOrNull } from '@/lib/utils/finance-display';
import { sharesTotalHundredths, type saveRevenueRuleFormSchema } from '@/lib/validations/finance';
import type { RevenueRuleTargets } from '@/types/finance';

// The lines of a revenue rule's new version (Task P4.7.02): who receives a share, and how many percent of it.

const text = financeCopy.rules;
const PCT_STEP = 1 / RULE_PCT_SCALE;
export type RuleFormInput = z.input<typeof saveRevenueRuleFormSchema>;
export type RuleFormValues = z.output<typeof saveRevenueRuleFormSchema>;
export type RuleForm = UseFormReturn<RuleFormInput, unknown, RuleFormValues>;
type LineKey = 'beneficiary' | 'rwId' | 'vendorId' | 'pct';

export interface FieldsProps {
  form: RuleForm;
  targets: RevenueRuleTargets;
  rwOptions: readonly Option[];
}

const BENEFICIARY_OPTIONS: Option[] = DB_ENUMS.revenue_beneficiary.map((beneficiary) => ({
  value: beneficiary,
  label: financeCopy.beneficiaries[beneficiary],
}));

// The form path of one field of one line, as react-hook-form names it.
function linePath<Key extends LineKey>(index: number, key: Key): `lines.${number}.${Key}` {
  return ['lines', String(index), key].join('.') as `lines.${number}.${Key}`;
}

function BeneficiaryField({ form, index }: { form: RuleForm; index: number }) {
  return (
    <FormField
      control={form.control}
      name={linePath(index, 'beneficiary')}
      label={text.fields.beneficiary}
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value}
          onChange={(value) => {
            field.onChange(value);
            form.setValue(linePath(index, 'rwId'), null);
            form.setValue(linePath(index, 'vendorId'), null);
          }}
          options={BENEFICIARY_OPTIONS}
          placeholder={text.placeholders.choose}
          trigger={field}
        />
      )}
    />
  );
}

function VendorField({ form, index, targets }: { form: RuleForm; index: number } & Pick<FieldsProps, 'targets'>) {
  return (
    <FormField
      control={form.control}
      name={linePath(index, 'vendorId')}
      label={text.fields.vendor}
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value ?? ''}
          onChange={field.onChange}
          options={targets.vendors.map((vendor) => ({ value: vendor.id, label: vendor.name }))}
          placeholder={text.placeholders.choose}
          trigger={field}
        />
      )}
    />
  );
}

function LineRwField({ form, index, rwOptions }: { form: RuleForm; index: number } & Pick<FieldsProps, 'rwOptions'>) {
  const isTreasury = form.watch(linePath(index, 'beneficiary')) === 'rw_treasury';
  return (
    <FormField
      control={form.control}
      name={linePath(index, 'rwId')}
      label={text.fields.rw}
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value === null ? '' : String(field.value)}
          onChange={(value) => {
            field.onChange(numberOrNull(value));
          }}
          options={[{ value: '', label: text.placeholders.ownRws }, ...rwOptions]}
          placeholder={text.placeholders.ownRws}
          trigger={field}
          disabled={!isTreasury}
        />
      )}
    />
  );
}

function PctField({ form, index }: { form: RuleForm; index: number }) {
  return (
    <FormField
      control={form.control}
      name={linePath(index, 'pct')}
      label={text.fields.pct}
      render={(field) => (
        <Input
          {...field}
          type="number"
          inputMode="decimal"
          min={PCT_STEP}
          max={RULE_TOTAL_PCT}
          step={PCT_STEP}
          className="h-11 tabular-nums"
          value={Number.isNaN(field.value) ? '' : field.value}
          onChange={(event) => {
            field.onChange(Number(event.target.value));
          }}
        />
      )}
    />
  );
}

function LineRow({ form, index, onRemove, targets, rwOptions }: FieldsProps & { index: number; onRemove: () => void }) {
  const isVendor = form.watch(linePath(index, 'beneficiary')) === 'umkm_vendor';
  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
      <BeneficiaryField form={form} index={index} />
      {isVendor ? (
        <VendorField form={form} index={index} targets={targets} />
      ) : (
        <LineRwField form={form} index={index} rwOptions={rwOptions} />
      )}
      <PctField form={form} index={index} />
      <Button type="button" variant="ghost" size="icon" className="size-11" onClick={onRemove}>
        <Trash2 aria-hidden />
        <span className="sr-only">{text.removeLine}</span>
      </Button>
    </div>
  );
}

function LinesTotal({ form }: { form: RuleForm }) {
  const lines = form.watch('lines').map((line) => ({ pct: Number.isFinite(line.pct) ? line.pct : 0 }));
  const total = sharesTotalHundredths(lines) / RULE_PCT_SCALE;
  return (
    <p className="text-body-sm tabular-nums" aria-live="polite">
      {text.total(total.toFixed(RULE_PCT_DECIMALS))}
    </p>
  );
}

export function LinesEditor({ form, targets, rwOptions }: FieldsProps) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  return (
    <fieldset className="space-y-3">
      <legend className="text-body-sm font-medium">{text.fields.lines}</legend>
      {fields.map((line, index) => (
        <LineRow
          key={line.id}
          form={form}
          index={index}
          targets={targets}
          rwOptions={rwOptions}
          onRemove={() => {
            remove(index);
          }}
        />
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={fields.length >= RULE_MAX_LINES}
          onClick={() => {
            append({ beneficiary: 'kelurahan', rwId: null, vendorId: null, pct: 0 });
          }}
        >
          <Plus aria-hidden />
          {text.addLine}
        </Button>
        <LinesTotal form={form} />
      </div>
    </fieldset>
  );
}

