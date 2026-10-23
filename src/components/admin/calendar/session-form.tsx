'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Control } from 'react-hook-form';
import { toast } from 'sonner';

import { TimeField } from '@/components/admin/calendar/time-field';
import { NumberInputField, SelectField, TextField } from '@/components/admin/cms/fields';
import { withRowId } from '@/components/admin/cms/schedule-values';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { SESSION_LIMITS } from '@/config/sessions';
import { SESSION_STATUS } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { useActionForm } from '@/hooks/use-action-form';
import { copy } from '@/lib/copy/id';
import { createVisitSessionSchema, type VisitSessionInput } from '@/lib/validations/session';
import type { ActionResult } from '@/types/action-result';
import type { VisitSessionAdmin } from '@/types/session';

const text = copy.sessions.editor;
const FIELDS = ['label', 'startTime', 'endTime', 'capacity', 'status', 'notes'] as const;
const STATUS_OPTIONS = DB_ENUMS.session_status.map((status) => ({
  value: status,
  label: SESSION_STATUS[status].label,
}));
const DEFAULT_CAPACITY = 40;
const DEFAULT_START = '08:00';
const DEFAULT_END = '10:00';

export type SessionAction = (values: unknown) => Promise<ActionResult<VisitSessionAdmin>>;

export interface SessionFormProps {
  sessionDate: string;
  // null for a new session of that day.
  session: VisitSessionAdmin | null;
  // createVisitSessionAction for a new session, updateVisitSessionAction for one that exists.
  action: SessionAction;
  onSaved: () => void;
}

type SessionControl = Control<VisitSessionInput>;

function valuesOf(sessionDate: string, session: VisitSessionAdmin | null): VisitSessionInput {
  if (session === null) {
    return {
      sessionDate,
      label: '',
      startTime: DEFAULT_START,
      endTime: DEFAULT_END,
      capacity: DEFAULT_CAPACITY,
      status: 'open',
      notes: '',
    };
  }
  return {
    sessionDate: session.sessionDate,
    label: session.label,
    startTime: session.startTime,
    endTime: session.endTime,
    capacity: session.capacity,
    status: session.status,
    notes: session.notes ?? '',
  };
}

// While the session holds bookings its times are disabled, the capacity stops at the seats reserved and
// `cancelled` is not offered (visit_sessions_guard).
function TimeRow({ control, locked }: { control: SessionControl; locked: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TimeField
        control={control}
        name="startTime"
        label={text.startTime}
        disabled={locked}
        required
      />
      <TimeField control={control} name="endTime" label={text.endTime} disabled={locked} required />
    </div>
  );
}

function CapacityRow({ control, reserved }: { control: SessionControl; reserved: number }) {
  const locked = reserved > 0;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <NumberInputField
        control={control}
        name="capacity"
        label={text.capacity}
        description={locked ? text.capacityHint(reserved) : undefined}
        required
      />
      <SelectField
        control={control}
        name="status"
        label={text.status}
        options={
          locked ? STATUS_OPTIONS.filter((option) => option.value !== 'cancelled') : STATUS_OPTIONS
        }
      />
    </div>
  );
}

function SessionFields({ control, reserved }: { control: SessionControl; reserved: number }) {
  return (
    <>
      <TextField
        control={control}
        name="label"
        label={text.label}
        maxLength={SESSION_LIMITS.label}
        required
      />
      <TimeRow control={control} locked={reserved > 0} />
      <CapacityRow control={control} reserved={reserved} />
      <TextField
        control={control}
        name="notes"
        label={text.notes}
        description={text.notesHint}
        maxLength={SESSION_LIMITS.notes}
        multiline
      />
    </>
  );
}

// docs/StyleGuide.md §6.8: one session's fields, with the helper text once it holds bookings.
export function SessionForm({ sessionDate, session, action, onSaved }: SessionFormProps) {
  const reserved = session?.reservedPax ?? 0;
  const form = useForm({
    resolver: zodResolver(createVisitSessionSchema),
    defaultValues: valuesOf(sessionDate, session),
  });
  const send: SessionAction = session ? (values) => action(withRowId(values, session.id)) : action;
  const { submit, failure } = useActionForm({
    form,
    action: send,
    fields: FIELDS,
    onSuccess: () => {
      toast.success(session ? text.saved : text.created);
      onSaved();
    },
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        {reserved > 0 ? <FormAlert tone="info">{text.lockedHint}</FormAlert> : null}
        <SessionFields control={form.control} reserved={reserved} />
        <Button type="submit" loading={form.formState.isSubmitting} className="w-full sm:w-auto">
          {text.save}
        </Button>
      </PostForm>
    </Form>
  );
}
