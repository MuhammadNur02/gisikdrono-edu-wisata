'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { useForm, useWatch, type Control } from 'react-hook-form';
import { toast } from 'sonner';

import { SelectField, SortOrderField, StatusField, TextField } from '@/components/admin/cms/fields';
import {
  MediaTypeField,
  PhotoFields,
  VideoFields,
} from '@/components/admin/cms/gallery-media-fields';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { CMS_LIMITS } from '@/config/cms';
import { GALLERY_CATEGORY_LABELS } from '@/config/status';
import { ALT_TEXT_MAX_LENGTH } from '@/config/uploads';
import { DB_ENUMS } from '@/db/enums';
import { useActionForm } from '@/hooks/use-action-form';
import { copy } from '@/lib/copy/id';
import { createGalleryItemSchema, type CreateGalleryItemInput } from '@/lib/validations/gallery';
import type { ActionResult } from '@/types/action-result';
import type { GalleryItemAdmin } from '@/types/cms';
import type { ContentOwner } from '@/types/content';

const text = copy.cms.galleries;
const common = copy.cms.common;
const FIELDS = [
  'mediaType',
  'image',
  'videoUrl',
  'still',
  'category',
  'caption',
  'altText',
  'takenAt',
  'sortOrder',
  'status',
] as const;
export const CATEGORY_OPTIONS = DB_ENUMS.gallery_category.map((category) => ({
  value: category,
  label: GALLERY_CATEGORY_LABELS[category],
}));

const BLANK_ITEM: CreateGalleryItemInput = {
  mediaType: 'image',
  image: null,
  videoUrl: '',
  still: null,
  category: 'activity',
  caption: '',
  altText: '',
  takenAt: '',
  sortOrder: 0,
  status: 'published',
};

export interface GalleryFormProps {
  owner: ContentOwner;
  action: (values: unknown) => Promise<ActionResult<GalleryItemAdmin>>;
  onSaved: () => void;
}

function DescriptionFields({ control }: { control: Control<CreateGalleryItemInput> }) {
  return (
    <>
      <TextField
        control={control}
        name="altText"
        label={text.altText}
        required
        maxLength={ALT_TEXT_MAX_LENGTH}
      />
      <TextField
        control={control}
        name="caption"
        label={text.caption}
        maxLength={CMS_LIMITS.caption}
        multiline
      />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <SelectField
          control={control}
          name="category"
          label={text.category}
          required
          options={CATEGORY_OPTIONS}
        />
        <TextField
          control={control}
          name="takenAt"
          label={text.takenAt}
          type="date"
          maxLength={10}
        />
        <SortOrderField control={control} name="sortOrder" />
        <StatusField control={control} name="status" />
      </div>
    </>
  );
}

function MediaFields({
  control,
  owner,
}: {
  control: Control<CreateGalleryItemInput>;
  owner: ContentOwner;
}) {
  const mediaType = useWatch({ control, name: 'mediaType' });
  return (
    <>
      <MediaTypeField control={control} />
      {mediaType === 'video' ? (
        <VideoFields control={control} owner={owner} />
      ) : (
        <PhotoFields control={control} owner={owner} />
      )}
    </>
  );
}

function SaveButtons({
  isSubmitting,
  onChoose,
}: {
  isSubmitting: boolean;
  onChoose: (another: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="submit"
        loading={isSubmitting}
        onClick={() => {
          onChoose(false);
        }}
      >
        {common.save}
      </Button>
      <Button
        type="submit"
        variant="outline"
        disabled={isSubmitting}
        onClick={() => {
          onChoose(true);
        }}
      >
        {text.saveAndAdd}
      </Button>
    </div>
  );
}

// Task P2.9.06, docs/PRD.md FR-ADMIN-10: a new gallery item, a photo or a YouTube video. "Simpan dan tambah lagi"
// keeps the dialog open with an empty form, for an officer putting up a whole visit's photos.
export function GalleryForm({ owner, action, onSaved }: GalleryFormProps) {
  const router = useRouter();
  const addAnother = useRef(false);
  const form = useForm({
    resolver: zodResolver(createGalleryItemSchema),
    defaultValues: BLANK_ITEM,
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: FIELDS,
    onSuccess: () => {
      toast.success(common.saved(text.noun));
      router.refresh();
      if (addAnother.current) form.reset(BLANK_ITEM);
      else onSaved();
    },
  });

  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <MediaFields control={form.control} owner={owner} />
        <DescriptionFields control={form.control} />
        <SaveButtons
          isSubmitting={form.formState.isSubmitting}
          onChoose={(another) => {
            addAnother.current = another;
          }}
        />
      </PostForm>
    </Form>
  );
}
