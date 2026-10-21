'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm, type Control } from 'react-hook-form';
import { toast } from 'sonner';

import { SelectField, SortOrderField, StatusField, TextField } from '@/components/admin/cms/fields';
import { CATEGORY_OPTIONS } from '@/components/admin/cms/gallery-form';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { CMS_LIMITS } from '@/config/cms';
import { ALT_TEXT_MAX_LENGTH } from '@/config/uploads';
import { useActionForm } from '@/hooks/use-action-form';
import { copy } from '@/lib/copy/id';
import { updateGalleryItemSchema, type UpdateGalleryItemInput } from '@/lib/validations/gallery';
import type { ActionResult } from '@/types/action-result';
import type { GalleryItemAdmin } from '@/types/cms';

const text = copy.cms.galleries;
const common = copy.cms.common;
const FIELDS = ['category', 'caption', 'altText', 'takenAt', 'sortOrder', 'status'] as const;

export interface GalleryEditFormProps {
  item: GalleryItemAdmin;
  action: (values: unknown) => Promise<ActionResult<GalleryItemAdmin>>;
  onSaved: () => void;
}

function valuesOf(item: GalleryItemAdmin): UpdateGalleryItemInput {
  return {
    id: item.id,
    category: item.category,
    caption: item.caption ?? '',
    altText: item.altText,
    takenAt: item.takenAt ?? '',
    sortOrder: item.sortOrder,
    status: item.status === 'published' ? 'published' : 'draft',
  };
}

function EditFields({ control }: { control: Control<UpdateGalleryItemInput> }) {
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

// An existing item keeps its photo or video (a new one is a new item); its description and place change here.
export function GalleryEditForm({ item, action, onSaved }: GalleryEditFormProps) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(updateGalleryItemSchema),
    defaultValues: valuesOf(item),
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: FIELDS,
    onSuccess: () => {
      toast.success(common.saved(text.noun));
      onSaved();
      router.refresh();
    },
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <EditFields control={form.control} />
        <Button type="submit" loading={form.formState.isSubmitting}>
          {common.save}
        </Button>
      </PostForm>
    </Form>
  );
}
