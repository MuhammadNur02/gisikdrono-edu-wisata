'use client';

import type { UseFormReturn } from 'react-hook-form';

import { FormField } from '@/components/forms/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FormControl,
  FormDescription,
  FormField as FieldController,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { BOOKING_LIMITS } from '@/config/booking';
import { DB_ENUMS, type EnumValue } from '@/db/enums';
import { bookingWizardCopy } from '@/lib/copy/booking-wizard';
import { walkInCopy } from '@/lib/copy/walk-in';
import type { CreateAdminBookingValues } from '@/lib/validations/booking';
import type { WalkInPackage } from '@/types/walk-in';

// The fields of the officer's booking at the counter (Task P4.3.10). What they hold before the schema reads them: the
// boxes start unticked, the text fields empty.

const text = walkInCopy;
const bookerTypes = bookingWizardCopy.booker.bookerTypes;

export interface WalkInFields {
  packageId: string;
  visitSessionIds: string[];
  pax: number;
  bookerType: EnumValue<'booker_type'>;
  institutionName: string;
  picName: string;
  picPhone: string;
  picEmail: string;
  notes: string;
  isPhoneConfirmed: boolean;
  isCashOnTheSpot: boolean;
  consentAttested: boolean;
  idempotencyKey: string;
  quoteHash: string;
}

export type WalkInForm = UseFormReturn<WalkInFields, unknown, CreateAdminBookingValues>;

type CheckboxName = 'isPhoneConfirmed' | 'isCashOnTheSpot' | 'consentAttested';
type TextName = 'institutionName' | 'picName' | 'picPhone' | 'picEmail';

export function PackageField({
  form,
  packages,
}: {
  form: WalkInForm;
  packages: readonly WalkInPackage[];
}) {
  return (
    <FormField
      control={form.control}
      name="packageId"
      label={text.package}
      required
      wrapsOwnControl
      render={(field) => (
        <Select
          value={field.value}
          onValueChange={(packageId) => {
            field.onChange(packageId);
            form.setValue('visitSessionIds', []);
          }}
        >
          <FormControl aria-required>
            <SelectTrigger ref={field.ref} onBlur={field.onBlur} className="min-h-11 w-full">
              <SelectValue placeholder={text.packagePlaceholder} />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            {packages.map((tourPackage) => (
              <SelectItem key={tourPackage.id} value={tourPackage.id}>
                {tourPackage.name} · {tourPackage.rws.map((rw) => rw.label).join(' + ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );
}

export function BookerTypeField({ form }: { form: WalkInForm }) {
  return (
    <FormField
      control={form.control}
      name="bookerType"
      label={text.bookerType}
      required
      wrapsOwnControl
      render={(field) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <FormControl aria-required>
            <SelectTrigger ref={field.ref} onBlur={field.onBlur} className="min-h-11 w-full">
              <SelectValue />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            {DB_ENUMS.booker_type.map((bookerType) => (
              <SelectItem key={bookerType} value={bookerType}>
                {bookerTypes[bookerType]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );
}

export function PaxField({ form }: { form: WalkInForm }) {
  return (
    <FormField
      control={form.control}
      name="pax"
      label={text.pax}
      required
      render={(field) => (
        <Input
          {...field}
          type="number"
          inputMode="numeric"
          min={1}
          value={Number.isNaN(field.value) ? '' : field.value}
          onChange={(event) => {
            field.onChange(event.target.valueAsNumber);
          }}
        />
      )}
    />
  );
}

export function TextInputField(props: {
  form: WalkInForm;
  name: TextName;
  label: string;
  description?: string;
  required?: boolean;
  type?: 'text' | 'email' | 'tel';
}) {
  return (
    <FormField
      control={props.form.control}
      name={props.name}
      label={props.label}
      description={props.description}
      required={props.required}
      render={(field) => <Input {...field} type={props.type ?? 'text'} autoComplete="off" />}
    />
  );
}

export function NotesField({ form }: { form: WalkInForm }) {
  return (
    <FormField
      control={form.control}
      name="notes"
      label={text.notes}
      render={(field) => <Textarea {...field} rows={2} maxLength={BOOKING_LIMITS.notes} />}
    />
  );
}

export function TickField(props: {
  form: WalkInForm;
  name: CheckboxName;
  label: string;
  description?: string;
}) {
  return (
    <FieldController
      control={props.form.control}
      name={props.name}
      render={({ field }) => (
        <FormItem className="flex flex-row items-start gap-3 space-y-0">
          <FormControl>
            <Checkbox
              ref={field.ref}
              checked={field.value}
              onBlur={field.onBlur}
              onCheckedChange={(checked) => {
                field.onChange(checked === true);
              }}
              className="mt-0.5 size-6"
            />
          </FormControl>
          <div className="space-y-1">
            <FormLabel className="block text-body leading-normal font-normal">
              {props.label}
            </FormLabel>
            {props.description ? <FormDescription>{props.description}</FormDescription> : null}
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  );
}
