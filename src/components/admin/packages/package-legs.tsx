'use client';

import { useFieldArray } from 'react-hook-form';

import { TextField } from '@/components/admin/cms/fields';
import { FormSection } from '@/components/admin/cms/form-section';
import { type PackageControl } from '@/components/admin/packages/package-fields';
import {
  AddRowButton,
  RowCard,
  RwSelectField,
  type RwOption,
} from '@/components/admin/packages/package-tiers';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { Input } from '@/components/ui/input';
import { PACKAGE_LIMITS } from '@/config/packages';
import { rwLabel, type RwId } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import { rowFieldName } from '@/lib/utils/form-paths';

const text = copy.packages;
const legs = text.legs;
const steps = text.itinerary;
// `HH:MM`, as the browser's time picker writes it.
const CLOCK_TIME_LENGTH = 5;

interface RowProps {
  control: PackageControl;
  index: number;
  rwOptions: readonly RwOption[];
  onRemove: () => void;
}

// A combo's route (docs/PRD.md FR-ADMIN-05) is not edited from this form yet (decision on PR #35): its legs wait for
// the save_package RPC (Task P4.3.11). The legs saved so far are shown, so the officer knows whether it may go on sale.
export function ComboRouteNotice({
  rwIds,
  rwOptions,
}: {
  rwIds: readonly RwId[];
  rwOptions: readonly RwOption[];
}) {
  const names = rwIds.map(
    (rwId) => rwOptions.find((option) => option.id === rwId)?.name ?? rwLabel(rwId),
  );
  return (
    <FormSection title={text.sections.legs}>
      <FormAlert tone="info">
        {legs.deferred} {legs.deferredHint}
      </FormAlert>
      {names.length > 0 ? <p className="text-body-sm">{legs.visits(names.join(' → '))}</p> : null}
    </FormSection>
  );
}

function StepTimeField({ control, index }: { control: PackageControl; index: number }) {
  return (
    <FormField
      control={control}
      name={rowFieldName('itinerary', index, 'time')}
      label={steps.time}
      render={(field) => (
        <Input
          type="time"
          name={field.name}
          ref={field.ref}
          onBlur={field.onBlur}
          value={typeof field.value === 'string' ? field.value.slice(0, CLOCK_TIME_LENGTH) : ''}
          onChange={(event) => {
            field.onChange(event.target.value === '' ? null : event.target.value);
          }}
        />
      )}
    />
  );
}

function StepRow({ control, index, rwOptions, onRemove }: RowProps) {
  return (
    <RowCard
      title={steps.rowTitle(index + 1)}
      removeLabel={steps.remove(index + 1)}
      onRemove={onRemove}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <StepTimeField control={control} index={index} />
        <RwSelectField
          control={control}
          name={rowFieldName('itinerary', index, 'rwId')}
          label={steps.rw}
          options={rwOptions}
          noneLabel={steps.noRw}
        />
      </div>
      <TextField
        control={control}
        name={rowFieldName('itinerary', index, 'title')}
        label={steps.title}
        maxLength={PACKAGE_LIMITS.itineraryTitle}
        required
      />
      <TextField
        control={control}
        name={rowFieldName('itinerary', index, 'description')}
        label={steps.descriptionField}
        maxLength={PACKAGE_LIMITS.itineraryDescription}
        multiline
      />
    </RowCard>
  );
}

// The plan of the day the package page shows, step by step.
export function ItinerarySection({
  control,
  rwOptions,
}: {
  control: PackageControl;
  rwOptions: readonly RwOption[];
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'itinerary' });
  return (
    <FormSection title={text.sections.itinerary}>
      <p className="text-body-sm text-muted-foreground">{steps.hint}</p>
      {fields.map((step, index) => (
        <StepRow
          key={step.id}
          control={control}
          index={index}
          rwOptions={rwOptions}
          onRemove={() => {
            remove(index);
          }}
        />
      ))}
      {fields.length < PACKAGE_LIMITS.itinerarySteps ? (
        <AddRowButton
          label={steps.add}
          onAdd={() => {
            append({ rwId: null, time: null, title: '', description: '' });
          }}
        />
      ) : null}
    </FormSection>
  );
}
