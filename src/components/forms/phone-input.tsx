'use client';

import { useState } from 'react';
import type * as React from 'react';

import { InputWithPrefix } from '@/components/forms/input-with-prefix';
import { copy } from '@/lib/copy/id';
import { localDigits, normalizePhone } from '@/lib/utils/phone';

const E164_PREFIX = '+62';

export interface PhoneInputProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'prefix'
> {
  // The E.164 number ('+6281234567890'), or what was typed so far for the schema to judge.
  value: string;
  onChange: (value: string) => void;
}

function toValue(typed: string): string {
  const digits = typed.replace(/\D/g, '');
  if (digits === '') return '';
  return normalizePhone(digits) ?? `${E164_PREFIX}${digits}`;
}

// docs/StyleGuide.md §5.6: a fixed +62 chip, and '0812…', '812…' or '62812…' all become '+62812…'.
// The field keeps what the visitor typed until they leave it, then shows the tidy number.
export function PhoneInput({ value, onChange, onBlur, ...props }: PhoneInputProps) {
  const [typed, setTyped] = useState(() => localDigits(value));
  const [lastValue, setLastValue] = useState(value);

  // A form reset or a restored draft changes value from outside; show that instead of the old typing.
  if (value !== lastValue) {
    setLastValue(value);
    setTyped(localDigits(value));
  }

  return (
    <InputWithPrefix
      prefix={E164_PREFIX}
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      placeholder={copy.forms.phone.placeholder}
      value={typed}
      onChange={(event) => {
        const next = toValue(event.target.value);
        setTyped(event.target.value);
        setLastValue(next);
        onChange(next);
      }}
      onBlur={(event) => {
        if (normalizePhone(value)) setTyped(localDigits(value));
        onBlur?.(event);
      }}
      {...props}
    />
  );
}
