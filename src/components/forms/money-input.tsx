'use client';

import type * as React from 'react';

import { InputWithPrefix } from '@/components/forms/input-with-prefix';
import { formatThousands, parseRupiah } from '@/lib/utils/currency';

export interface MoneyInputProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'prefix'
> {
  // Whole rupiah, or null while the field is empty (CLAUDE.md §7.1: never a float).
  value: number | null;
  onChange: (value: number | null) => void;
}

// docs/StyleGuide.md §5.6, admin only: shows '2.500.000' while typing and hands the form 2500000.
export function MoneyInput({ value, onChange, ...props }: MoneyInputProps) {
  return (
    <InputWithPrefix
      prefix="Rp"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className="tabular-nums"
      value={value === null ? '' : formatThousands(value)}
      onChange={(event) => {
        onChange(parseRupiah(event.target.value));
      }}
      {...props}
    />
  );
}
