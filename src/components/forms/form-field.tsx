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
  useFormField,
} from '@/components/ui/form';
import { copy } from '@/lib/copy/id';
import { fieldLabelId } from '@/lib/utils/field-ids';

// The label carries an id so a control that is no labelable element can still point aria-labelledby at it.
function FieldLabel({ label, required }: { label: string; required: boolean }) {
  const { formItemId } = useFormField();
  return (
    <FormLabel id={fieldLabelId(formItemId)}>
      {label} {required && <RequiredMark />}
    </FormLabel>
  );
}

// TOutput is what the form's resolver hands on once it passes, when that differs from what the fields hold.
export interface FormFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
  TOutput = TValues,
> {
  control: Control<TValues, unknown, TOutput>;
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
export function RequiredMark() {
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
export function FormField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
  TOutput = TValues,
>({
  control,
  name,
  label,
  description,
  required = false,
  className,
  wrapsOwnControl = false,
  render,
}: FormFieldProps<TValues, TName, TOutput>) {
  return (
    <FieldController
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FieldLabel label={label} required={required} />
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
