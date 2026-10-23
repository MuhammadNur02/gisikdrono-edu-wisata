'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Control } from 'react-hook-form';
import { toast } from 'sonner';

import { TimeField } from '@/components/admin/calendar/time-field';
import {
  CheckboxField,
  NumberInputField,
  SelectField,
  TextField,
} from '@/components/admin/cms/fields';
import { withRowId } from '@/components/admin/cms/schedule-values';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { SESSION_LIMITS, WEEKDAYS } from '@/config/sessions';
import { useActionForm } from '@/hooks/use-action-form';
import { sessionsCopy } from '@/lib/copy/sessions';
import {
  createSessionTemplateSchema,
  weekdayKeyOf,
  type SessionTemplateInput,
  type WeekdayKey,
} from '@/lib/validations/session';
import type { ActionResult } from '@/types/action-result';
import type { SessionTemplateAdmin } from '@/types/session';

const text = sessionsCopy.templates;
const FIELDS = ['weekday', 'label', 'startTime', 'endTime', 'capacity', 'isActive'] as const;
const WEEKDAY_OPTIONS = WEEKDAYS.map((weekday) => ({
  value: String(weekday),
  label: sessionsCopy.weekdayNames[weekday],
}));
const DEFAULT_CAPACITY = 40;
const DEFAULT_START = '08:00';
const DEFAULT_END = '10:00';
const SATURDAY: WeekdayKey = '6';

export type TemplateAction = (values: unknown) => Promise<ActionResult<SessionTemplateAdmin>>;

export interface TemplateFormProps {
  template: SessionTemplateAdmin | null;
  // createSessionTemplateAction for a new pattern, updateSessionTemplateAction for one that exists.
  action: TemplateAction;
  onSaved: () => void;
}

function valuesOf(template: SessionTemplateAdmin | null): SessionTemplateInput {
  if (template === null) {
    return {
      weekday: SATURDAY,
      label: '',
      startTime: DEFAULT_START,
      endTime: DEFAULT_END,
      capacity: DEFAULT_CAPACITY,
      isActive: true,
    };
  }
  return {
    weekday: weekdayKeyOf(template.weekday),
    label: template.label,
    startTime: template.startTime,
    endTime: template.endTime,
    capacity: template.capacity,
    isActive: template.isActive,
  };
}

function TemplateFields({ control }: { control: Control<SessionTemplateInput> }) {
  return (
    <>
      <SelectField
        control={control}
        name="weekday"
        label={text.weekday}
        options={WEEKDAY_OPTIONS}
      />
      <TextField
        control={control}
        name="label"
        label={text.label}
        maxLength={SESSION_LIMITS.label}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TimeField control={control} name="startTime" label={text.startTime} required />
        <TimeField control={control} name="endTime" label={text.endTime} required />
      </div>
      <NumberInputField control={control} name="capacity" label={text.capacity} required />
      <CheckboxField control={control} name="isActive" label={text.isActive} />
    </>
  );
}

// One row of the weekly pattern (docs/StyleGuide.md §6.8).
export function TemplateForm({ template, action, onSaved }: TemplateFormProps) {
  const form = useForm({
    resolver: zodResolver(createSessionTemplateSchema),
    defaultValues: valuesOf(template),
  });
  const send: TemplateAction = template
    ? (values) => action(withRowId(values, template.id))
    : action;
  const { submit, failure } = useActionForm({
    form,
    action: send,
    fields: FIELDS,
    onSuccess: () => {
      toast.success(text.saved);
      onSaved();
    },
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <TemplateFields control={form.control} />
        <Button type="submit" loading={form.formState.isSubmitting} className="w-full sm:w-auto">
          {text.save}
        </Button>
      </PostForm>
    </Form>
  );
}
