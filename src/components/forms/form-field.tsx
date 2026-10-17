'use client';

import type { ReactElement } from 'react';
import type { Control, ControllerRenderProps, FieldPath, FieldValues } from 'react-hook-form';

import {
  FormControl,
  FormDescription,
  FormField as FieldController,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { copy } from '@/lib/copy/id';

export interface FormFieldProps<TValues extends FieldValues, TName extends FieldPath<TValues>> {
  control: Control<TValues>;
  name: TName;
  label: string;
  description?: string;
  required?: boolean;
  className?: string;
  render: (field: ControllerRenderProps<TValues, TName>) => ReactElement;
}

// Sighted users see the red asterisk; screen readers hear "wajib" instead (docs/StyleGuide.md §5.6).
function RequiredMark() {
  return (
    <>
      <span aria-hidden className="text-destructive">
        *
      </span>
      <span className="sr-only">({copy.forms.required})</span>
    </>
  );
}

// Label, control, helper and error in one call. The control receives id, aria-describedby and
// aria-invalid through FormControl, so errors are announced and linked without extra wiring.
export function FormField<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  control,
  name,
  label,
  description,
  required = false,
  className,
  render,
}: FormFieldProps<TValues, TName>) {
  return (
    <FieldController
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>
            {label} {required && <RequiredMark />}
          </FormLabel>
          <FormControl aria-required={required || undefined}>{render(field)}</FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
