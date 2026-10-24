'use client';

import type { Control, FieldPathByValue, FieldValues } from 'react-hook-form';

import { FormField } from '@/components/forms/form-field';
import { Input } from '@/components/ui/input';

const CLOCK_TIME_LENGTH = 5;
const SECONDS_PER_MINUTE = 60;

export interface TimeFieldProps<TValues extends FieldValues> {
  control: Control<TValues>;
  name: FieldPathByValue<TValues, string>;
  label: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
}

// `08:00:00` as Postgres reads a time back shows as `08:00`; the schema drops the seconds again.
function clockValue(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, CLOCK_TIME_LENGTH) : '';
}

// A time of day (`08:00`) through the browser's own time picker.
export function TimeField<TValues extends FieldValues>({
  control,
  name,
  label,
  description,
  required = false,
  disabled = false,
}: TimeFieldProps<TValues>) {
  return (
    <FormField
      control={control}
      name={name}
      label={label}
      description={description}
      required={required}
      render={(field) => (
        <Input
          {...field}
          type="time"
          step={SECONDS_PER_MINUTE}
          disabled={disabled}
          value={clockValue(field.value)}
          className="tabular-nums"
        />
      )}
    />
  );
}
