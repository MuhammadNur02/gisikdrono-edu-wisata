'use client';

import { useWatch, type Control, type FieldPathByValue } from 'react-hook-form';

import {
  CheckboxField,
  NumberInputField,
  SelectField,
  SortOrderField,
  TextField,
} from '@/components/admin/cms/fields';
import { FormSection } from '@/components/admin/cms/form-section';
import { MoneyField } from '@/components/admin/cms/money-field';
import { FormField } from '@/components/forms/form-field';
import { SlugInput } from '@/components/forms/slug-input';
import { Textarea } from '@/components/ui/textarea';
import { PACKAGE_LIMITS, PACKAGE_PATHS } from '@/config/packages';
import { CONTENT_STATUS, PACKAGE_CATEGORY } from '@/config/status';
import { DB_ENUMS, type EnumValue } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import type { PackageInput } from '@/lib/validations/package';

const text = copy.packages;
const fields = text.fields;

export type PackageControl = Control<PackageInput>;

// `YYYY-MM-DD`, as the browser's date picker writes it.
const DATE_LENGTH = 10;

// pending_review is the articles' step; a package is a draft, on the site, or archived.
const PACKAGE_STATUSES = DB_ENUMS.content_status.filter((status) => status !== 'pending_review');
const STATUS_OPTIONS = PACKAGE_STATUSES.map((status) => ({
  value: status,
  label: CONTENT_STATUS[status].label,
}));
const BASIS_OPTIONS = [
  { value: 'per_pax', label: fields.pricePerPax },
  { value: 'flat_group', label: fields.flatPrice },
];

// Highlights and inclusions: one item per line; the schema drops blank lines and trims the rest.
function LinesField({
  control,
  name,
  label,
  description,
}: {
  control: PackageControl;
  name: FieldPathByValue<PackageInput, string[]>;
  label: string;
  description: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      label={label}
      description={description}
      render={(field) => (
        <Textarea
          name={field.name}
          ref={field.ref}
          onBlur={field.onBlur}
          rows={4}
          value={Array.isArray(field.value) ? field.value.join('\n') : ''}
          onChange={(event) => {
            field.onChange(event.target.value.split(/\r?\n/));
          }}
        />
      )}
    />
  );
}

function SlugField({ control }: { control: PackageControl }) {
  const name = useWatch({ control, name: 'name' });
  return (
    <FormField
      control={control}
      name="slug"
      label={fields.slug}
      description={copy.cms.common.slugHint}
      required
      render={(field) => <SlugInput {...field} source={name} prefix={PACKAGE_PATHS.publicPrefix} />}
    />
  );
}

function IntroFields({ control }: { control: PackageControl }) {
  return (
    <>
      <TextField
        control={control}
        name="tagline"
        label={fields.tagline}
        maxLength={PACKAGE_LIMITS.tagline}
      />
      <TextField
        control={control}
        name="descriptionMd"
        label={fields.descriptionMd}
        description={copy.cms.common.markdownHint}
        maxLength={PACKAGE_LIMITS.descriptionMd}
        multiline
      />
    </>
  );
}

export function BasicsFields({
  control,
  categories,
}: {
  control: PackageControl;
  // The kinds this officer may choose here: no combo for an RW admin, and only a combo once a package exists as one.
  categories: readonly EnumValue<'package_category'>[];
}) {
  const options = categories.map((category) => ({
    value: category,
    label: PACKAGE_CATEGORY[category].label,
  }));
  return (
    <FormSection title={text.sections.basics}>
      <TextField
        control={control}
        name="name"
        label={fields.name}
        maxLength={PACKAGE_LIMITS.name}
        required
      />
      <SlugField control={control} />
      <SelectField
        control={control}
        name="category"
        label={fields.category}
        options={options}
        required
      />
      <IntroFields control={control} />
    </FormSection>
  );
}

export function VisitFields({ control }: { control: PackageControl }) {
  return (
    <FormSection title={text.sections.visit}>
      <LinesField
        control={control}
        name="highlights"
        label={fields.highlights}
        description={fields.highlightsHint}
      />
      <LinesField
        control={control}
        name="inclusions"
        label={fields.inclusions}
        description={fields.inclusionsHint}
      />
      <NumberInputField control={control} name="durationMinutes" label={fields.durationMinutes} />
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberInputField control={control} name="minPax" label={fields.minPax} required />
        <NumberInputField control={control} name="maxPax" label={fields.maxPax} required />
      </div>
    </FormSection>
  );
}

export function PricingFields({ control }: { control: PackageControl }) {
  const basis = useWatch({ control, name: 'pricingBasis' });
  return (
    <>
      <SelectField
        control={control}
        name="pricingBasis"
        label={fields.pricingBasis}
        options={BASIS_OPTIONS}
        required
      />
      {basis === 'flat_group' ? (
        <MoneyField
          control={control}
          name="flatPrice"
          label={fields.flatPrice}
          description={fields.flatPriceHint}
          required
        />
      ) : (
        <MoneyField control={control} name="pricePerPax" label={fields.pricePerPax} required />
      )}
    </>
  );
}

// canPublish: false for a combo whose saved legs do not visit two RWs yet (tour_packages_legs_guard); the status then
// offers no `Tayang` and says why.
export function PublishFields({
  control,
  canPublish,
}: {
  control: PackageControl;
  canPublish: boolean;
}) {
  const options = canPublish
    ? STATUS_OPTIONS
    : STATUS_OPTIONS.filter((option) => option.value !== 'published');
  return (
    <FormSection title={text.sections.publish}>
      <SelectField
        control={control}
        name="status"
        label={fields.status}
        description={canPublish ? undefined : text.errors.comboNeedsLegs}
        options={options}
        required
      />
      <CheckboxField control={control} name="isFeatured" label={fields.isFeatured} />
      <ValidityFields control={control} />
      <SortOrderField control={control} name="sortOrder" />
    </FormSection>
  );
}

function ValidityFields({ control }: { control: PackageControl }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        control={control}
        name="validFrom"
        label={fields.validFrom}
        type="date"
        maxLength={DATE_LENGTH}
      />
      <TextField
        control={control}
        name="validTo"
        label={fields.validTo}
        type="date"
        maxLength={DATE_LENGTH}
      />
    </div>
  );
}
