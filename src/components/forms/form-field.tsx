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
  // FormControl hands its id and aria attributes to the one element it wraps. A Radix Select root renders no
  // element, so a select field sets this and puts <FormControl> around its trigger itself, as the booking
  // wizard's booker-type field does; the label then names the trigger (Task P2.9.12).
  wrapsOwnControl?: boolean;
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
  wrapsOwnControl = false,
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
          {wrapsOwnControl ? (
            render(field)
          ) : (
            <FormControl aria-required={required || undefined}>{render(field)}</FormControl>
          )}
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
