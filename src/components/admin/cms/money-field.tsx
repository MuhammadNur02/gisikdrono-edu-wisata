'use client';

import type { Control, FieldPathByValue, FieldValues } from 'react-hook-form';

import { FormField } from '@/components/forms/form-field';
import { MoneyInput } from '@/components/forms/money-input';

export interface MoneyFieldProps<TValues extends FieldValues> {
  control: Control<TValues>;
  // Integer rupiah (CLAUDE.md §7.1); an empty field is null for the schema to judge.
  name: FieldPathByValue<TValues, number | null> | FieldPathByValue<TValues, number>;
  label: string;
  description?: string;
  required?: boolean;
}

// A price typed as `2.500.000` behind `Rp` (docs/StyleGuide.md §5.6), held as whole rupiah.
export function MoneyField<TValues extends FieldValues>({
  name,
  ...base
}: MoneyFieldProps<TValues>) {
  return (
    <FormField
      {...base}
      name={name}
      render={(field) => (
        <MoneyInput
          name={field.name}
          ref={field.ref}
          onBlur={field.onBlur}
          value={typeof field.value === 'number' ? field.value : null}
          onChange={field.onChange}
        />
      )}
    />
  );
}
