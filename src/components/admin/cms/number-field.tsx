'use client';

import type * as React from 'react';

import { Input } from '@/components/ui/input';

export interface NumberFieldProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type'
> {
  value: number | null;
  onChange: (value: number | null) => void;
}

// A number that may stay empty (coordinates, an order): an empty field is null, anything else a number for the schema
// to judge, so a typo reads as invalid instead of as zero.
export function NumberField({ value, onChange, ...props }: NumberFieldProps) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      step="any"
      value={value ?? ''}
      onChange={(event) => {
        const typed = event.target.value;
        onChange(typed === '' ? null : Number(typed));
      }}
      {...props}
    />
  );
}
