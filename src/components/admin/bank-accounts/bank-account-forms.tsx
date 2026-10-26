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
import { Textarea } from '@/components/ui/textarea';
import { BANK_ACCOUNT_LIMITS } from '@/config/bank-accounts';
import { useActionForm } from '@/hooks/use-action-form';
import { bankAccountsCopy } from '@/lib/copy/bank-accounts';
import { staffCopy } from '@/lib/copy/staff';
import { withStepUp } from '@/lib/utils/step-up';
import {
  revealBankAccountFormSchema,
  setBankAccountFormSchema,
  type BankAccountTarget,
} from '@/lib/validations/bank-account';
import type { ActionResult } from '@/types/action-result';
import type { MaskedBankAccount } from '@/types/bank-account';

const text = bankAccountsCopy;

type FormAction<TData> = (values: unknown) => Promise<ActionResult<TData>>;

export interface BankAccountActions {
  load: FormAction<MaskedBankAccount>;
  reveal: FormAction<string | null>;
  save: FormAction<null>;
  // verifyStaffTotpAction: the code is checked first, so the RPC sees a fresh one (docs/Security.md §5.3).
  stepUp: FormAction<null>;
}

function FormButtons({
  label,
  isSubmitting,
  onCancel,
}: {
  label: string;
  isSubmitting: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button type="submit" className="min-h-11" loading={isSubmitting}>
        {label}
      </Button>
      <Button type="button" variant="ghost" className="min-h-11" onClick={onCancel}>
        {text.cancel}
      </Button>
    </div>
  );
}

interface RevealFormProps {
  target: BankAccountTarget;
  actions: BankAccountActions;
  onRevealed: (accountNumber: string | null) => void;
  onCancel: () => void;
}

// The reason and a fresh code, then get_*_account with p_reveal, which records the reason and spends one of 20.
export function RevealNumberForm({ target, actions, onRevealed, onCancel }: RevealFormProps) {
  const form = useForm({
    resolver: zodResolver(revealBankAccountFormSchema),
    defaultValues: { target, reason: '', code: '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action: withStepUp(actions.stepUp, actions.reveal),
    fields: ['reason', 'code'],
    onSuccess: onRevealed,
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="reason"
          label={text.revealReason}
          description={text.revealHint}
          required
          render={(field) => (
            <Textarea {...field} rows={2} maxLength={BANK_ACCOUNT_LIMITS.revealReason.max} />
          )}
        />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <FormButtons
          label={text.revealSubmit}
          isSubmitting={form.formState.isSubmitting}
          onCancel={onCancel}
        />
      </PostForm>
    </Form>
  );
}

interface EditFormProps {
  target: BankAccountTarget;
  account: MaskedBankAccount;
  actions: BankAccountActions;
  onSaved: () => void;
  onCancel: () => void;
}

function AccountFields({
  control,
}: {
  control: ReturnType<typeof useEditForm>['form']['control'];
}) {
  const limits = BANK_ACCOUNT_LIMITS;
  return (
    <>
      <FormField
        control={control}
        name="bankName"
        label={text.bankName}
        required
        render={(field) => <Input {...field} maxLength={limits.bankName.max} />}
      />
      <FormField
        control={control}
        name="accountNumber"
        label={text.accountNumber}
        required
        render={(field) => <Input {...field} inputMode="numeric" autoComplete="off" />}
      />
      <FormField
        control={control}
        name="accountHolder"
        label={text.accountHolder}
        required
        render={(field) => <Input {...field} maxLength={limits.accountHolder.max} />}
      />
    </>
  );
}

// The number is typed afresh: the form never holds the saved one.
function useEditForm({ target, account, actions, onSaved }: Omit<EditFormProps, 'onCancel'>) {
  const form = useForm({
    resolver: zodResolver(setBankAccountFormSchema),
    defaultValues: {
      target,
      bankName: account.bankName ?? '',
      accountNumber: '',
      accountHolder: account.accountHolder ?? '',
      code: '',
    },
  });
  const action = useActionForm({
    form,
    action: withStepUp(actions.stepUp, actions.save),
    fields: ['bankName', 'accountNumber', 'accountHolder', 'code'],
    onSuccess: onSaved,
  });
  return { form, ...action };
}

export function EditAccountForm({ onCancel, ...props }: EditFormProps) {
  const { form, submit, failure } = useEditForm(props);
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        {props.target.kind === 'rw' ? <FormAlert tone="info">{text.editHint}</FormAlert> : null}
        <AccountFields control={form.control} />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <FormButtons
          label={text.save}
          isSubmitting={form.formState.isSubmitting}
          onCancel={onCancel}
        />
      </PostForm>
    </Form>
  );
}
