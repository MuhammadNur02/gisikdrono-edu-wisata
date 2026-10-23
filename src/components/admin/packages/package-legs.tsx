'use client';

import { useFieldArray, useWatch } from 'react-hook-form';

import { NumberInputField, TextField } from '@/components/admin/cms/fields';
import { Section, type PackageControl } from '@/components/admin/packages/package-fields';
import {
  AddRowButton,
  ListError,
  RowCard,
  RwSelectField,
  type RwOption,
} from '@/components/admin/packages/package-tiers';
import { FormField } from '@/components/forms/form-field';
import { Input } from '@/components/ui/input';
import { PACKAGE_LIMITS } from '@/config/packages';
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

function LegRow({ control, index, rwOptions, onRemove }: RowProps) {
  return (
    <RowCard
      title={legs.rowTitle(index + 1)}
      removeLabel={legs.remove(index + 1)}
      onRemove={onRemove}
    >
      <RwSelectField
        control={control}
        name={rowFieldName('legs', index, 'rwId')}
        label={legs.rw}
        options={rwOptions}
      />
      <NumberInputField
        control={control}
        name={rowFieldName('legs', index, 'durationMinutes')}
        label={legs.durationMinutes}
      />
      <TextField
        control={control}
        name={rowFieldName('legs', index, 'notes')}
        label={legs.notes}
        maxLength={PACKAGE_LIMITS.legNotes}
      />
    </RowCard>
  );
}

// A combo's legs, in visiting order (docs/PRD.md FR-ADMIN-05): two RWs or more, each once. An RW package visits its
// own RW, which the database writes as its single leg, so this section shows only for a combo.
export function LegsSection({
  control,
  rwOptions,
}: {
  control: PackageControl;
  rwOptions: readonly RwOption[];
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'legs' });
  const chosen = useWatch({ control, name: 'legs' });
  // The next RW the combo does not visit yet; none left, no button.
  const unused = rwOptions.find((option) => !chosen.some((leg) => leg.rwId === option.id));
  return (
    <Section title={text.sections.legs}>
      <p className="text-body-sm text-muted-foreground">{legs.hint}</p>
      <ListError control={control} name="legs" />
      {fields.map((leg, index) => (
        <LegRow
          key={leg.id}
          control={control}
          index={index}
          rwOptions={rwOptions}
          onRemove={() => {
            remove(index);
          }}
        />
      ))}
      {unused ? (
        <AddRowButton
          label={legs.add}
          onAdd={() => {
            append({ rwId: unused.id, durationMinutes: null, notes: '' });
          }}
        />
      ) : null}
    </Section>
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
    <Section title={text.sections.itinerary}>
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
    </Section>
  );
}
