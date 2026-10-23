'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { toast } from 'sonner';

import {
  NumberInputField,
  OptionalSelectField,
  SelectField,
  SortOrderField,
  StatusField,
  TextField,
} from '@/components/admin/cms/fields';
import { ImagePathField } from '@/components/admin/cms/image-path-field';
import { MapPositionPicker } from '@/components/admin/cms/map-position-picker';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { SlugInput } from '@/components/forms/slug-input';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { CMS_LIMITS } from '@/config/cms';
import { PLAN_HOTSPOT_IDS } from '@/config/map';
import type { RwId } from '@/config/rw';
import { ACTIVITY_POINT_TYPE } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { useActionForm } from '@/hooks/use-action-form';
import { copy } from '@/lib/copy/id';
import { createImageUpload } from '@/lib/uploads/upload-client';
import {
  saveActivityPointSchema,
  type SaveActivityPointInput,
} from '@/lib/validations/activity-point';
import type { ActionResult } from '@/types/action-result';
import type { ActivityPointAdmin } from '@/types/cms';

const text = copy.cms.points;
const common = copy.cms.common;
const FIELDS = [
  'name',
  'slug',
  'pointType',
  'shortDescription',
  'bodyMd',
  'imagePath',
  'mapX',
  'mapY',
  'lat',
  'lng',
  'sortOrder',
  'status',
] as const;
const TYPE_OPTIONS = DB_ENUMS.activity_point_type.map((type) => ({
  value: type,
  label: ACTIVITY_POINT_TYPE[type].label,
}));

type PointControl = Control<SaveActivityPointInput>;

export interface ActivityPointFormProps {
  // The point as it is, or a blank one with a fresh id for a new point.
  point: SaveActivityPointInput;
  rwId: RwId;
  // The RW's own page, shown before the slug, which is an anchor on it.
  pagePath: string;
  action: (values: unknown) => Promise<ActionResult<ActivityPointAdmin>>;
  onSaved: () => void;
}

function NameFields({ control, pagePath }: { control: PointControl; pagePath: string }) {
  const name = useWatch({ control, name: 'name' });
  return (
    <>
      <TextField
        control={control}
        name="name"
        label={text.name}
        required
        maxLength={CMS_LIMITS.pointName}
      />
      <FormField
        control={control}
        name="slug"
        label={common.slug}
        description={common.slugHint}
        required
        render={(field) => <SlugInput {...field} source={name} prefix={`${pagePath}#`} />}
      />
      <SelectField
        control={control}
        name="pointType"
        label={text.pointType}
        required
        options={TYPE_OPTIONS}
      />
    </>
  );
}

function PhotoField({
  control,
  rwId,
  pointId,
}: {
  control: PointControl;
  rwId: RwId;
  pointId: string;
}) {
  const upload = useMemo(
    () => createImageUpload({ rwId, purpose: 'activity-point', entityId: pointId }),
    [rwId, pointId],
  );
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
          alt={text.name}
        />
      )}
    />
  );
}

function DescriptionFields({ control }: { control: PointControl }) {
  return (
    <>
      <TextField
        control={control}
        name="shortDescription"
        label={text.shortDescription}
        maxLength={CMS_LIMITS.pointShortDescription}
      />
      <TextField
        control={control}
        name="bodyMd"
        label={text.bodyMd}
        description={common.markdownHint}
        maxLength={CMS_LIMITS.longText}
        multiline
      />
    </>
  );
}

function PositionFields({
  control,
  setValue,
}: {
  control: PointControl;
  setValue: UseFormSetValue<SaveActivityPointInput>;
}) {
  const [mapX, mapY] = useWatch({ control, name: ['mapX', 'mapY'] });
  const pick = (x: number, y: number) => {
    setValue('mapX', x, { shouldDirty: true, shouldValidate: true });
    setValue('mapY', y, { shouldDirty: true, shouldValidate: true });
  };
  return (
    <fieldset className="space-y-3">
      <legend className="text-body-sm font-medium">{text.position}</legend>
      <p className="text-caption text-muted-foreground">{text.positionHint}</p>
      <MapPositionPicker x={mapX} y={mapY} onPick={pick} />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <NumberInputField control={control} name="mapX" label={text.mapX} />
        <NumberInputField control={control} name="mapY" label={text.mapY} />
        <NumberInputField control={control} name="lat" label={text.lat} />
        <NumberInputField control={control} name="lng" label={text.lng} />
      </div>
      {/* The plan element lit while the hotspot is open (docs/StyleGuide.md §5.13); the ids are the plan's own. */}
      <OptionalSelectField
        control={control}
        name="svgHotspotId"
        label={text.hotspot}
        description={text.hotspotHint}
        noneLabel={text.hotspotNone}
        options={PLAN_HOTSPOT_IDS.map((id) => ({ value: id, label: id }))}
      />
    </fieldset>
  );
}

// Task P2.9.06, docs/PRD.md FR-ADMIN-14: one activity point, new or as it is, inside its FormDialog.
export function ActivityPointForm({
  point,
  rwId,
  pagePath,
  action,
  onSaved,
}: ActivityPointFormProps) {
  const router = useRouter();
  // The point as the form first got it: its id names the photo's folder for as long as the form is open.
  const [initial] = useState(point);
  const form = useForm({ resolver: zodResolver(saveActivityPointSchema), defaultValues: initial });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: FIELDS,
    onSuccess: (saved) => {
      toast.success(common.saved(`${text.noun} "${saved.name}"`));
      onSaved();
      router.refresh();
    },
  });

  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <NameFields control={form.control} pagePath={pagePath} />
        <DescriptionFields control={form.control} />
        <PhotoField control={form.control} rwId={rwId} pointId={initial.id} />
        <PositionFields control={form.control} setValue={form.setValue} />
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <SortOrderField control={form.control} name="sortOrder" />
          <StatusField control={form.control} name="status" />
        </div>
        <Button type="submit" loading={form.formState.isSubmitting}>
          {common.save}
        </Button>
      </PostForm>
    </Form>
  );
}
