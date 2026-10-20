'use client';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';

import { TotpCodeInput } from '@/components/auth/totp-code-input';
import { FormField } from '@/components/forms/form-field';
import { copy } from '@/lib/copy/id';

export interface TotpCodeFieldProps<TValues extends FieldValues> {
  control: Control<TValues>;
  name: FieldPath<TValues>;
  description?: string;
  autoFocus?: boolean;
}

// The authenticator code of /mfa/verify, /mfa/enroll and /reset-password.
export function TotpCodeField<TValues extends FieldValues>({
  control,
  name,
  description,
  autoFocus = false,
}: TotpCodeFieldProps<TValues>) {
  return (
    <FormField
      control={control}
      name={name}
      label={copy.auth.mfa.code}
      description={description}
      required
      render={(field) => (
        <TotpCodeInput
          {...field}
          value={typeof field.value === 'string' ? field.value : ''}
          autoFocus={autoFocus}
        />
      )}
    />
  );
}
