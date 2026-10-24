'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';

import {
  WizardPanel,
  WizardStepFrame,
  type WizardStepProps,
} from '@/components/booking/wizard-step-frame';
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
  dayAvailability,
  sessionsOn,
  unbookableDatesBetween,
} from '@/lib/utils/booking-wizard';
import { cn } from '@/lib/utils/cn';
import { formatDateLong } from '@/lib/utils/dates';
import { packagePath } from '@/lib/utils/paths';
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

// DESIGN-SPEC §3.10: the label and its hint on the left, the stepper on the right, on every screen.
const PAX_ROW =
  'grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 [&>*]:col-start-1 [&>*:nth-child(2)]:col-start-2 [&>*:nth-child(2)]:row-span-2 [&>*:nth-child(2)]:row-start-1';

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
      className={PAX_ROW}
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
          days={dayAvailability(legs, pax)}
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
  // A combo names each RW over its sessions; one RW needs no name.
  showsRw: boolean;
}) {
  const { form, leg, index, visitDate, pax, showsRw } = props;
  const labelId = useId();
  const chosenIds = useWatch({ control: form.control, name: 'visitSessionIds' });
  const chosen = chosenIds[index] ?? '';
  const sessions = sessionsOn(leg, visitDate);
  return (
    <div className="space-y-3">
      <p id={labelId} className={cn('text-label text-foreground', !showsRw && 'sr-only')}>
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
    <div className="space-y-5">
      {legs.map((leg, index) => (
        <LegSessions
          key={leg.rw.id}
          form={form}
          leg={leg}
          index={index}
          visitDate={visitDate}
          pax={pax}
          showsRw={legs.length > 1}
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
    <p aria-live="polite" className="flex items-center gap-2 text-caption text-muted-foreground">
      <span
        aria-hidden
        className={cn('size-1.5 shrink-0 rounded-full', isStale ? 'bg-warning' : 'bg-success')}
      />
      {isStale ? text.stale : text.refreshed}
    </p>
  );
}

// "Sesi pada Rabu, 28 Oktober 2026" over the sessions, with the seat refresh note beside it.
function SessionsHead({ form, isStale }: { form: ScheduleForm; isStale: boolean }) {
  const visitDate = useWatch({ control: form.control, name: 'visitDate' });
  if (visitDate === '') return <FreshnessNote isStale={isStale} />;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h3 className="text-label-lg text-foreground">
        {text.sessionsOn(formatDateLong(visitDate))}
      </h3>
      <FreshnessNote isStale={isStale} />
    </div>
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
        <WizardStepFrame
          title={text.title}
          description={text.description}
          onBack={onBack}
          backLabel={props.backLabel}
          nextLabel={props.nextLabel}
          exitHref={packagePath(wizardPackage.slug)}
        >
          <WizardPanel className="divide-y divide-border *:pt-6 *:first:pt-0 md:space-y-7 md:*:pt-7">
            <PaxField form={form} minPax={wizardPackage.minPax} maxPax={wizardPackage.maxPax} />
            <DateField form={form} legs={legs} pax={pax} />
            <div className="space-y-4">
              <SessionsHead form={form} isStale={props.isStale} />
              <SessionsField form={form} legs={legs} />
            </div>
          </WizardPanel>
        </WizardStepFrame>
      </PostForm>
    </Form>
  );
}
