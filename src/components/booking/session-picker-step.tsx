'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';

import { WizardStepFrame, type WizardStepProps } from '@/components/booking/wizard-step-frame';
import { DatePicker } from '@/components/forms/date-picker';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { NumberStepper } from '@/components/forms/number-stepper';
import { PostForm } from '@/components/forms/post-form';
import { SessionPicker } from '@/components/forms/session-picker';
import { Form } from '@/components/ui/form';
import { copy } from '@/lib/copy/id';
import {
  bookableDates,
  busyDates,
  sessionsOn,
  unbookableDatesBetween,
} from '@/lib/utils/booking-wizard';
import { scheduleStepSchema } from '@/lib/validations/booking';
import type { BookableLeg } from '@/types/session';

const text = copy.booking.wizard.schedule;

export interface SessionPickerStepProps extends WizardStepProps {
  // The seats left, read again every 15 s by the shell (docs/PRD.md FR-BOOK-02).
  legs: BookableLeg[];
  // The last read was refused or failed, so the seats shown may be out of date (review of PR #27, L7).
  isStale: boolean;
}

interface ScheduleValues {
  visitDate: string;
  visitSessionIds: string[];
  pax: number;
}

type ScheduleForm = UseFormReturn<ScheduleValues>;

function useScheduleForm({ wizardPackage, draft, update }: SessionPickerStepProps): ScheduleForm {
  const form = useForm<ScheduleValues>({
    resolver: zodResolver(scheduleStepSchema(wizardPackage.maxPax)),
    defaultValues: {
      visitDate: draft.visitDate ?? '',
      visitSessionIds: draft.sessionIds,
      pax: draft.pax,
    },
  });
  // A refresh or the back button keeps what was chosen.
  useEffect(() => {
    const watcher = form.watch((values) => {
      update({
        visitDate: values.visitDate ? values.visitDate : null,
        sessionIds: values.visitSessionIds ?? [],
        pax: values.pax,
      });
    });
    return () => {
      watcher.unsubscribe();
    };
  }, [form, update]);
  return form;
}

function PaxField({
  form,
  minPax,
  maxPax,
}: {
  form: ScheduleForm;
  minPax: number;
  maxPax: number;
}) {
  return (
    <FormField
      control={form.control}
      name="pax"
      label={text.paxLabel}
      description={text.paxHint(minPax, maxPax)}
      required
      render={(field) => (
        <NumberStepper
          value={field.value}
          min={minPax}
          max={maxPax}
          onBlur={field.onBlur}
          onChange={(pax) => {
            field.onChange(pax);
          }}
        />
      )}
    />
  );
}

function DateField({ form, legs, pax }: { form: ScheduleForm; legs: BookableLeg[]; pax: number }) {
  const dates = bookableDates(legs, pax);
  const first = dates[0];
  const last = dates.at(-1);
  if (first === undefined || last === undefined)
    return <FormAlert tone="info">{text.noDates}</FormAlert>;
  return (
    <FormField
      control={form.control}
      name="visitDate"
      label={text.dateLabel}
      required
      render={(field) => (
        <DatePicker
          value={field.value === '' ? undefined : field.value}
          firstDate={first}
          lastDate={last}
          unavailableDates={unbookableDatesBetween(first, last, dates)}
          busyDates={busyDates(legs)}
          onChange={(visitDate) => {
            field.onChange(visitDate);
            // Sessions belong to their day.
            form.setValue(
              'visitSessionIds',
              legs.map(() => ''),
            );
          }}
        />
      )}
    />
  );
}

function LegSessions(props: {
  form: ScheduleForm;
  leg: BookableLeg;
  index: number;
  visitDate: string;
  pax: number;
}) {
  const { form, leg, index, visitDate, pax } = props;
  const labelId = useId();
  const chosenIds = useWatch({ control: form.control, name: 'visitSessionIds' });
  const chosen = chosenIds[index] ?? '';
  const sessions = sessionsOn(leg, visitDate);
  return (
    <div className="space-y-3">
      <p id={labelId} className="text-body-sm font-medium">
        {text.sessionLabel(leg.rw.label)}
      </p>
      {sessions.length === 0 ? (
        <FormAlert tone="info">{text.noSessions}</FormAlert>
      ) : (
        <SessionPicker
          aria-labelledby={labelId}
          sessions={sessions}
          pax={pax}
          value={chosen === '' ? undefined : chosen}
          onChange={(sessionId) => {
            const next = chosenIds.map((id, at) => (at === index ? sessionId : id));
            form.setValue('visitSessionIds', next, { shouldValidate: true });
          }}
        />
      )}
    </div>
  );
}

// A chosen session the latest seat count says is full, or too small for the group, is refused before moving on.
function hasRoomFor(values: ScheduleValues, legs: readonly BookableLeg[]): boolean {
  return legs.every((leg, index) =>
    sessionsOn(leg, values.visitDate).some(
      (session) => session.id === values.visitSessionIds[index] && session.remaining >= values.pax,
    ),
  );
}

function SessionsField({ form, legs }: { form: ScheduleForm; legs: BookableLeg[] }) {
  const [visitDate, pax] = useWatch({ control: form.control, name: ['visitDate', 'pax'] });
  const sessionsError = form.formState.errors.visitSessionIds;
  if (visitDate === '')
    return <p className="text-body-sm text-muted-foreground">{text.pickDateFirst}</p>;
  return (
    <div className="space-y-6">
      {legs.map((leg, index) => (
        <LegSessions
          key={leg.rw.id}
          form={form}
          leg={leg}
          index={index}
          visitDate={visitDate}
          pax={pax}
        />
      ))}
      {sessionsError && (
        <p role="alert" className="text-caption text-destructive">
          {sessionsError.message ?? copy.booking.validation.sessions}
        </p>
      )}
    </div>
  );
}

function FreshnessNote({ isStale }: { isStale: boolean }) {
  return (
    <p aria-live="polite" className="text-caption text-muted-foreground">
      {isStale ? text.stale : text.refreshed}
    </p>
  );
}

// Step jadwal (docs/PRD.md FR-BOOK-02, Task P3.5.01): the group size first, since it decides which days and sessions
// still have room; then a day on which every RW the package visits has a session, and one session per RW.
export function SessionPickerStep(props: SessionPickerStepProps) {
  const { wizardPackage, legs, onDone, onBack } = props;
  const form = useScheduleForm(props);
  const pax = useWatch({ control: form.control, name: 'pax' });
  const submit = form.handleSubmit((values) => {
    if (!hasRoomFor(values, legs)) {
      form.setError('visitSessionIds', { message: copy.errors.QUOTA_EXCEEDED });
      return;
    }
    onDone();
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        <WizardStepFrame title={text.title} onBack={onBack}>
          <PaxField form={form} minPax={wizardPackage.minPax} maxPax={wizardPackage.maxPax} />
          <DateField form={form} legs={legs} pax={pax} />
          <SessionsField form={form} legs={legs} />
          <FreshnessNote isStale={props.isStale} />
        </WizardStepFrame>
      </PostForm>
    </Form>
  );
}
