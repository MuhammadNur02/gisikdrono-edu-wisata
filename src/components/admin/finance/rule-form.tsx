'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { OptionSelect, type Option } from '@/components/admin/finance/option-select';
import {
  LinesEditor,
  type FieldsProps,
  type RuleFormInput,
  type RuleFormValues,
} from '@/components/admin/finance/rule-lines';
import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RULE_TOTAL_PCT } from '@/config/finance';
import { DB_ENUMS } from '@/db/enums';
import { useActionForm } from '@/hooks/use-action-form';
import { financeCopy } from '@/lib/copy/finance';
import { staffCopy } from '@/lib/copy/staff';
import { numberOrNull } from '@/lib/utils/finance-display';
import { saveRevenueRuleFormSchema } from '@/lib/validations/finance';
import type { ActionResult } from '@/types/action-result';
import type { RevenueRuleTargets, SavedRule } from '@/types/finance';

// Task P4.7.02: a revenue rule's new version. The shares are entered as percentages and must add up to 100; the total
// beside them is a convenience, save_revenue_rule checks it again (RULE_LINES_INVALID).

const text = financeCopy.rules;

export interface RuleFormProps {
  targets: RevenueRuleTargets;
  rwOptions: readonly Option[];
  today: string;
  submit: (values: unknown) => Promise<ActionResult<SavedRule>>;
  onDone: () => void;
}


const SCOPE_OPTIONS: Option[] = DB_ENUMS.revenue_rule_scope.map((scope) => ({
  value: scope,
  label: text.scopes[scope],
}));

function DefaultRwField({ form, rwOptions }: Pick<FieldsProps, 'form' | 'rwOptions'>) {
  return (
    <FormField
      control={form.control}
      name="rwId"
      label={text.fields.rw}
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value === null ? '' : String(field.value)}
          onChange={(value) => {
            field.onChange(numberOrNull(value));
          }}
          options={[{ value: '', label: text.allRws }, ...rwOptions]}
          placeholder={text.allRws}
          trigger={field}
        />
      )}
    />
  );
}

function TargetFields({ form, targets, rwOptions }: FieldsProps) {
  const scope = form.watch('scope');
  if (scope === 'package_default' || scope === 'addon_default') {
    return <DefaultRwField form={form} rwOptions={rwOptions} />;
  }
  const isProduct = scope === 'product';
  const choices = isProduct ? targets.products : targets.packages;
  return (
    <FormField
      control={form.control}
      name={isProduct ? 'productId' : 'packageId'}
      label={isProduct ? text.fields.product : text.fields.package}
      required
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value ?? ''}
          onChange={field.onChange}
          options={choices.map((choice) => ({ value: choice.id, label: choice.name }))}
          placeholder={text.placeholders.choose}
          trigger={field}
        />
      )}
    />
  );
}

function ScopeField({ form }: Pick<FieldsProps, 'form'>) {
  return (
    <FormField
      control={form.control}
      name="scope"
      label={text.fields.scope}
      required
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value}
          onChange={field.onChange}
          options={SCOPE_OPTIONS}
          placeholder={text.placeholders.choose}
          trigger={field}
        />
      )}
    />
  );
}

function useRuleForm({ today, submit: action, onDone }: Pick<RuleFormProps, 'today' | 'submit' | 'onDone'>) {
  const form = useForm<RuleFormInput, unknown, RuleFormValues>({
    resolver: zodResolver(saveRevenueRuleFormSchema),
    defaultValues: {
      scope: 'package_default',
      rwId: null,
      packageId: null,
      productId: null,
      name: '',
      effectiveFrom: today,
      lines: [{ beneficiary: 'kelurahan', rwId: null, vendorId: null, pct: RULE_TOTAL_PCT }],
      code: '',
    },
  });
  const fields = ['scope', 'name', 'effectiveFrom', 'lines', 'packageId', 'productId', 'code'] as const;
  return { form, ...useActionForm({ form, action, fields, onSuccess: onDone }) };
}

export function RuleForm({ targets, rwOptions, today, submit, onDone }: RuleFormProps) {
  const { form, submit: send, failure } = useRuleForm({ today, submit, onDone });
  return (
    <Form {...form}>
      <PostForm onSubmit={send}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <ScopeField form={form} />
        <TargetFields form={form} targets={targets} rwOptions={rwOptions} />
        <FormField
          control={form.control}
          name="name"
          label={text.fields.name}
          required
          render={(field) => <Input {...field} className="h-11" />}
        />
        <FormField
          control={form.control}
          name="effectiveFrom"
          label={text.fields.effectiveFrom}
          required
          render={(field) => <Input {...field} type="date" min={today} className="h-11" />}
        />
        <LinesEditor form={form} targets={targets} rwOptions={rwOptions} />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {text.submit}
        </Button>
      </PostForm>
    </Form>
  );
}
