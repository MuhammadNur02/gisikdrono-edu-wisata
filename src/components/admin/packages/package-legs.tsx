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
import { FormField } from '@/components/forms/form-field';
import { Input } from '@/components/ui/input';
import { PACKAGE_LIMITS } from '@/config/packages';
import { packagesCopy } from '@/lib/copy/packages';
import { rowFieldName } from '@/lib/utils/form-paths';

const text = packagesCopy;
const steps = text.itinerary;
// `HH:MM`, as the browser's time picker writes it.
const CLOCK_TIME_LENGTH = 5;

interface RowProps {
  control: PackageControl;
  index: number;
  rwOptions: readonly RwOption[];
  onRemove: () => void;
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
