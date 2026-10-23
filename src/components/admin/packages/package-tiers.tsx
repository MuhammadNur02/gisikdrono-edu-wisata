'use client';

import { Plus, Trash2 } from 'lucide-react';
import {
  useFieldArray,
  useFormState,
  type ControllerRenderProps,
  type FieldPath,
} from 'react-hook-form';

import { NumberInputField } from '@/components/admin/cms/fields';
import { FormSection } from '@/components/admin/cms/form-section';
import { MoneyField } from '@/components/admin/cms/money-field';
import { PricingFields, type PackageControl } from '@/components/admin/packages/package-fields';
import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { FormControl } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PACKAGE_LIMITS } from '@/config/packages';
import type { RwId } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import { rowFieldName } from '@/lib/utils/form-paths';
import type { PackageInput } from '@/lib/validations/package';

const text = copy.packages;
const tiers = text.tiers;
const FIRST_TIER_SIZE = 20;
const NO_RW = 'none';

export interface RwOption {
  id: RwId;
  name: string;
}

// The message a list carries as a whole (overlapping tiers, a combo with one RW), under the list's own heading.
export function ListError({
  control,
  name,
}: {
  control: PackageControl;
  name: 'priceTiers' | 'legs';
}) {
  const { errors } = useFormState({ control, name });
  const message = errors[name]?.message ?? errors[name]?.root?.message;
  if (!message) return null;
  return (
    <p role="alert" className="text-body-sm font-medium text-destructive">
      {message}
    </p>
  );
}

interface RwChoice {
  value: string;
  label: string;
}

function RwSelect({
  field,
  choices,
}: {
  field: ControllerRenderProps<PackageInput, FieldPath<PackageInput>>;
  choices: readonly RwChoice[];
}) {
  return (
    <Select
      value={typeof field.value === 'number' ? String(field.value) : NO_RW}
      onValueChange={(value) => {
        field.onChange(value === NO_RW ? null : Number(value));
      }}
    >
      <FormControl>
        <SelectTrigger ref={field.ref} onBlur={field.onBlur} className="w-full">
          <SelectValue />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// An RW picked by its name; the field holds the number (or none, where `noneLabel` is given).
export function RwSelectField({
  control,
  name,
  label,
  options,
  noneLabel,
}: {
  control: PackageControl;
  name: FieldPath<PackageInput>;
  label: string;
  options: readonly RwOption[];
  noneLabel?: string;
}) {
  const choices = [
    ...(noneLabel ? [{ value: NO_RW, label: noneLabel }] : []),
    ...options.map((option) => ({ value: String(option.id), label: option.name })),
  ];
  return (
    <FormField
      control={control}
      name={name}
      label={label}
      wrapsOwnControl
      render={(field) => <RwSelect field={field} choices={choices} />}
    />
  );
}

// One row of a list editor (a tier, a leg, a step): its number, its fields, and a button that takes it out.
export function RowCard({
  title,
  removeLabel,
  onRemove,
  children,
}: {
  title: string;
  removeLabel: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-body-sm font-medium">{title}</h4>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={removeLabel}
          className="size-11"
          onClick={onRemove}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      {children}
    </div>
  );
}

export function AddRowButton({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onAdd}>
      <Plus aria-hidden />
      {label}
    </Button>
  );
}

function TierRow({
  control,
  index,
  onRemove,
}: {
  control: PackageControl;
  index: number;
  onRemove: () => void;
}) {
  return (
    <RowCard
      title={tiers.rowTitle(index + 1)}
      removeLabel={tiers.remove(index + 1)}
      onRemove={onRemove}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberInputField
          control={control}
          name={rowFieldName('priceTiers', index, 'minPax')}
          label={tiers.minPax}
          required
        />
        <NumberInputField
          control={control}
          name={rowFieldName('priceTiers', index, 'maxPax')}
          label={tiers.maxPax}
          description={tiers.maxPaxHint}
        />
        <MoneyField
          control={control}
          name={rowFieldName('priceTiers', index, 'pricePerPax')}
          label={tiers.pricePerPax}
          required
        />
      </div>
    </RowCard>
  );
}

function TierRows({ control }: { control: PackageControl }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'priceTiers' });
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-body font-medium">{tiers.title}</h3>
        <p className="text-body-sm text-muted-foreground">{tiers.hint}</p>
      </div>
      <ListError control={control} name="priceTiers" />
      {fields.map((tier, index) => (
        <TierRow
          key={tier.id}
          control={control}
          index={index}
          onRemove={() => {
            remove(index);
          }}
        />
      ))}
      {fields.length < PACKAGE_LIMITS.tiers ? (
        <AddRowButton
          label={tiers.add}
          onAdd={() => {
            append({ id: null, minPax: FIRST_TIER_SIZE, maxPax: null, pricePerPax: 0 });
          }}
        />
      ) : null}
    </div>
  );
}

// tour_package_price_tiers (REC-13): the exclusion index refuses overlapping ranges; the schema says so first.
export function PricingSection({ control }: { control: PackageControl }) {
  return (
    <FormSection title={text.sections.pricing}>
      <PricingFields control={control} />
      <TierRows control={control} />
    </FormSection>
  );
}
