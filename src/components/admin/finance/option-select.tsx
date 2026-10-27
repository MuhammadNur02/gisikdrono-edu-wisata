'use client';

import type { ControllerRenderProps, FieldValues } from 'react-hook-form';

import { FormControl } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// The pickers of the finance forms (Task P4.7). FormControl sits around the trigger, not the Select root, which renders
// no element, so the label and the error reach what the superadmin operates (as role-select.tsx does).

export interface Option {
  value: string;
  label: string;
}

export interface OptionSelectProps {
  value: string | null;
  onChange: (value: string) => void;
  options: readonly Option[];
  placeholder: string;
  trigger: Pick<ControllerRenderProps<FieldValues, string>, 'ref' | 'onBlur'>;
  disabled?: boolean;
}

export function OptionSelect({ value, onChange, options, placeholder, trigger, disabled }: OptionSelectProps) {
  return (
    <Select value={value ?? ''} onValueChange={onChange} disabled={disabled}>
      <FormControl>
        <SelectTrigger ref={trigger.ref} onBlur={trigger.onBlur} className="h-11 w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="min-h-11">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
