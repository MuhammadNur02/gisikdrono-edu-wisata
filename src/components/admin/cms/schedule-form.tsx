'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useForm, type Control } from 'react-hook-form';
import { toast } from 'sonner';

import {
  DateTimeField,
  OptionalSelectField,
  SelectField,
  StatusField,
  TextField,
} from '@/components/admin/cms/fields';
import { ImagePathField } from '@/components/admin/cms/image-path-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { CMS_LIMITS } from '@/config/cms';
import type { RwId } from '@/config/rw';
import { SCHEDULE_TYPE_LABELS } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { useActionForm } from '@/hooks/use-action-form';
import { copy } from '@/lib/copy/id';
import { createImageUpload } from '@/lib/uploads/upload-client';
import { createScheduleSchema, type ScheduleInput } from '@/lib/validations/schedule';
import type { ActionResult } from '@/types/action-result';
import type { ScheduleAdmin, SchedulePackageOption } from '@/types/cms';

const text = copy.cms.schedules;
const common = copy.cms.common;
const FIELDS = [
  'title',
  'scheduleType',
  'descriptionMd',
  'startsAt',
  'endsAt',
  'venue',
  'recurrenceRule',
  'imagePath',
  'packageId',
  'status',
] as const;
const TYPE_OPTIONS = DB_ENUMS.schedule_type.map((type) => ({
  value: type,
  label: SCHEDULE_TYPE_LABELS[type],
}));

type ScheduleControl = Control<ScheduleInput>;

export interface ScheduleFormProps {
  // The RW whose schedule this is, which the photo is uploaded for.
  rwId: RwId;
  schedule: ScheduleInput;
  packages: SchedulePackageOption[];
  // createScheduleAction, or updateScheduleAction with the schedule's id added (ScheduleDialog).
  action: (values: unknown) => Promise<ActionResult<ScheduleAdmin>>;
  onSaved: () => void;
}

function WhenFields({ control }: { control: ScheduleControl }) {
  return (
    <div className="grid items-start gap-4 sm:grid-cols-2">
      <DateTimeField
        control={control}
        name="startsAt"
        label={text.startsAt}
        description={text.timeHint}
        required
      />
      <DateTimeField control={control} name="endsAt" label={text.endsAt} required />
    </div>
  );
}

function PackageField({
  control,
  packages,
}: {
  control: ScheduleControl;
  packages: SchedulePackageOption[];
}) {
  return (
    <OptionalSelectField
      control={control}
      name="packageId"
      label={text.packageId}
      noneLabel={text.noPackage}
      options={packages.map((option) => ({ value: option.id, label: option.name }))}
    />
  );
}

function PhotoField({ control, rwId }: { control: ScheduleControl; rwId: RwId }) {
  const upload = useMemo(() => createImageUpload({ rwId, purpose: 'gallery' }), [rwId]);
  return (
    <FormField
      control={control}
      name="imagePath"
      label={common.photo}
      render={(field) => (
        <ImagePathField
          value={field.value}
          onChange={field.onChange}
          upload={upload}
          alt={text.titleField}
        />
      )}
    />
  );
}

function DetailFields({ control }: { control: ScheduleControl }) {
  return (
    <>
      <TextField control={control} name="venue" label={text.venue} maxLength={CMS_LIMITS.venue} />
      <TextField
        control={control}
        name="descriptionMd"
        label={text.descriptionMd}
        description={common.markdownHint}
        maxLength={CMS_LIMITS.longText}
        multiline
      />
      <TextField
        control={control}
        name="recurrenceRule"
        label={text.recurrenceRule}
        description={text.recurrenceHint}
        maxLength={CMS_LIMITS.recurrenceRule}
      />
    </>
  );
}

function WhatFields({ control }: { control: ScheduleControl }) {
  return (
    <>
      <TextField
        control={control}
        name="title"
        label={text.titleField}
        required
        maxLength={CMS_LIMITS.scheduleTitle}
      />
      <SelectField
        control={control}
        name="scheduleType"
        label={text.scheduleType}
        required
        options={TYPE_OPTIONS}
      />
    </>
  );
}

// Task P2.9.06, docs/PRD.md FR-ADMIN-13: one performance of an RW with a schedule, new or as it is, in its sheet (Task P4.3.03).
export function ScheduleForm({ rwId, schedule, packages, action, onSaved }: ScheduleFormProps) {
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(createScheduleSchema), defaultValues: schedule });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: FIELDS,
    onSuccess: (saved) => {
      toast.success(common.saved(`${text.noun} "${saved.title}"`));
      onSaved();
      router.refresh();
    },
  });

  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <WhatFields control={form.control} />
        <WhenFields control={form.control} />
        <DetailFields control={form.control} />
        <PackageField control={form.control} packages={packages} />
        <PhotoField control={form.control} rwId={rwId} />
        <StatusField control={form.control} name="status" />
        <Button type="submit" loading={form.formState.isSubmitting}>
          {common.save}
        </Button>
      </PostForm>
    </Form>
  );
}
