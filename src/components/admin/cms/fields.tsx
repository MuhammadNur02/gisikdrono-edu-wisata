'use client';

import type { Control, ControllerRenderProps, FieldPathByValue, FieldValues } from 'react-hook-form';

import { NumberField } from '@/components/admin/cms/number-field';
import { FormField } from '@/components/forms/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PUBLISHABLE_STATUSES, type PublishableStatus } from '@/config/cms';
import { copy } from '@/lib/copy/id';

// The field kinds every CMS form repeats, on top of FormField (label, control, helper and error, docs/StyleGuide.md
// §5.6). Each one takes the form's control and the name of one of its fields of the right type.

interface FieldBase<TValues extends FieldValues> {
  control: Control<TValues>;
  label: string;
  description?: string;
  required?: boolean;
}

export interface TextFieldProps<TValues extends FieldValues> extends FieldBase<TValues> {
  name: FieldPathByValue<TValues, string | null>;
  maxLength: number;
  // A Textarea that grows, for Markdown and longer text.
  multiline?: boolean;
  type?: 'text' | 'email' | 'url' | 'date';
}

export function TextField<TValues extends FieldValues>({
  name,
  maxLength,
  multiline = false,
  type = 'text',
  ...base
}: TextFieldProps<TValues>) {
  return (
    <FormField
      {...base}
      name={name}
      render={(field) => {
        const value = typeof field.value === 'string' ? field.value : '';
        return multiline ? (
          <Textarea {...field} value={value} maxLength={maxLength} />
        ) : (
          <Input {...field} type={type} value={value} maxLength={maxLength} />
        );
      }}
    />
  );
}

export interface DateTimeFieldProps<TValues extends FieldValues> extends FieldBase<TValues> {
  name: FieldPathByValue<TValues, string | null>;
}

// A moment in Semarang time, as the browser's own picker writes it ('2026-10-25T19:00'); jakartaDateTimeSchema adds the
// offset.
export function DateTimeField<TValues extends FieldValues>({
  name,
  ...base
}: DateTimeFieldProps<TValues>) {
  return (
    <FormField
      {...base}
      name={name}
      render={(field) => (
        <Input
          {...field}
          type="datetime-local"
          value={typeof field.value === 'string' ? field.value : ''}
        />
      )}
    />
  );
}

export interface NumberInputFieldProps<TValues extends FieldValues> extends FieldBase<TValues> {
  // A nullable column, or one that is never NULL with emptyAs.
  name: FieldPathByValue<TValues, number | null> | FieldPathByValue<TValues, number>;
  // An empty field stands for this number, for columns that are never NULL (an order).
  emptyAs?: number;
}

export function NumberInputField<TValues extends FieldValues>({
  name,
  emptyAs,
  ...base
}: NumberInputFieldProps<TValues>) {
  return (
    <FormField
      {...base}
      name={name}
      render={(field) => (
        <NumberField
          name={field.name}
          ref={field.ref}
          onBlur={field.onBlur}
          value={typeof field.value === 'number' ? field.value : null}
          onChange={(value) => {
            field.onChange(value ?? emptyAs ?? null);
          }}
        />
      )}
    />
  );
}

interface SelectOption {
  value: string;
  label: string;
}

interface LabelledSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  required: boolean;
  // The trigger takes the field's ref and blur, so a validation error focuses it and touches the field.
  trigger: Pick<ControllerRenderProps<FieldValues, string>, 'ref' | 'onBlur'>;
}

// FormControl is put around the trigger, not the Select root, which renders no element: that is how the label,
// the helper text and the error reach the element a visitor operates (Task P2.9.12, as the booking wizard's
// booker-type field does).
function LabelledSelect({ value, onValueChange, options, required, trigger }: LabelledSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <FormControl aria-required={required || undefined}>
        <SelectTrigger ref={trigger.ref} onBlur={trigger.onBlur} className="w-full">
          <SelectValue />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// TValue is the union the field holds when it is narrower than string, such as a status enum (StatusField).
export interface SelectFieldProps<TValues extends FieldValues, TValue extends string = string>
  extends FieldBase<TValues> {
  name: FieldPathByValue<TValues, TValue>;
  options: readonly SelectOption[];
}

export function SelectField<TValues extends FieldValues, TValue extends string = string>({
  name,
  options,
  ...base
}: SelectFieldProps<TValues, TValue>) {
  return (
    <FormField
      {...base}
      name={name}
      wrapsOwnControl
      render={(field) => (
        <LabelledSelect
          value={String(field.value)}
          onValueChange={field.onChange}
          options={options}
          required={base.required === true}
          trigger={field}
        />
      )}
    />
  );
}

// The choice that stands for NULL in a select of a nullable column.
const NO_OPTION = 'none';

export interface OptionalSelectFieldProps<TValues extends FieldValues> extends FieldBase<TValues> {
  name: FieldPathByValue<TValues, string | null>;
  options: readonly SelectOption[];
  // What choosing none is called, such as `Tanpa paket`.
  noneLabel: string;
}

export function OptionalSelectField<TValues extends FieldValues>({
  name,
  options,
  noneLabel,
  ...base
}: OptionalSelectFieldProps<TValues>) {
  return (
    <FormField
      {...base}
      name={name}
      wrapsOwnControl
      render={(field) => (
        <LabelledSelect
          value={typeof field.value === 'string' ? field.value : NO_OPTION}
          onValueChange={(value) => {
            field.onChange(value === NO_OPTION ? null : value);
          }}
          options={[{ value: NO_OPTION, label: noneLabel }, ...options]}
          required={base.required === true}
          trigger={field}
        />
      )}
    />
  );
}

export interface CheckboxFieldProps<TValues extends FieldValues> extends FieldBase<TValues> {
  name: FieldPathByValue<TValues, boolean>;
}

export function CheckboxField<TValues extends FieldValues>({
  name,
  ...base
}: CheckboxFieldProps<TValues>) {
  return (
    <FormField
      {...base}
      name={name}
      render={(field) => (
        <Checkbox
          ref={field.ref}
          checked={field.value === true}
          onBlur={field.onBlur}
          onCheckedChange={(checked) => {
            field.onChange(checked === true);
          }}
          className="size-6"
        />
      )}
    />
  );
}

export interface StatusFieldProps<TValues extends FieldValues> {
  control: Control<TValues>;
  name: FieldPathByValue<TValues, PublishableStatus>;
}

// Draft or on the site, for content that needs no review (everything but articles).
export function StatusField<TValues extends FieldValues>({
  control,
  name,
}: StatusFieldProps<TValues>) {
  return (
    <SelectField
      control={control}
      name={name}
      label={copy.cms.common.status}
      options={PUBLISHABLE_STATUSES.map((status) => ({
        value: status,
        label: copy.cms.common.statusLabels[status],
      }))}
    />
  );
}

export function SortOrderField<TValues extends FieldValues>({
  control,
  name,
}: {
  control: Control<TValues>;
  name: FieldPathByValue<TValues, number>;
}) {
  return (
    <NumberInputField
      control={control}
      name={name}
      label={copy.cms.common.sortOrder}
      description={copy.cms.common.sortOrderHint}
      emptyAs={0}
    />
  );
}
