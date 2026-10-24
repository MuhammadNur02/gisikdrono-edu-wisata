'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useForm, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { toast } from 'sonner';

import { SelectField, StatusField, TextField } from '@/components/admin/cms/fields';
import { BookletUploader, type UploadBooklet } from '@/components/forms/booklet-uploader';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { SlugInput } from '@/components/forms/slug-input';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { CMS_LIMITS } from '@/config/cms';
import { BOOKLET_KIND_LABELS } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { useActionForm } from '@/hooks/use-action-form';
import { copy } from '@/lib/copy/id';
import { uploadBooklet } from '@/lib/uploads/upload-client';
import { saveBookletSchema, type SaveBookletInput } from '@/lib/validations/booklet';
import type { ActionResult } from '@/types/action-result';
import type { BookletAdmin } from '@/types/cms';
import type { ContentOwner } from '@/types/content';
import type { FinalizedPdf } from '@/types/upload';

const text = copy.cms.booklets;
const common = copy.cms.common;
const FIELDS = ['pdfPath', 'kind', 'slug', 'title', 'description', 'status'] as const;
const KIND_OPTIONS = DB_ENUMS.booklet_kind.map((kind) => ({
  value: kind,
  label: BOOKLET_KIND_LABELS[kind],
}));
const PUBLIC_PREFIX = '/e-booklet/';

type BookletControl = Control<SaveBookletInput>;

export interface BookletFormProps {
  booklet: SaveBookletInput;
  // The pages of a saved booklet, whose PDF stays as it is; null for a new one, whose PDF the form uploads.
  savedPageCount: number | null;
  owner: ContentOwner;
  action: (values: unknown) => Promise<ActionResult<BookletAdmin>>;
  onSaved: () => void;
}

// Each attempt goes up under an id of its own: once finalize has published a PDF, or sign-pages has claimed a
// booklet's pages, nothing more can be uploaded under that id (docs/Security.md §8.4).
function PdfField({
  control,
  setValue,
  owner,
}: {
  control: BookletControl;
  setValue: UseFormSetValue<SaveBookletInput>;
  owner: ContentOwner;
}) {
  const [uploaded, setUploaded] = useState<FinalizedPdf | null>(null);
  const attemptId = useRef('');
  const upload: UploadBooklet = (file, onPage) => {
    attemptId.current = crypto.randomUUID();
    return uploadBooklet(file, { rwId: owner, bookletId: attemptId.current }, onPage);
  };
  return (
    <FormField
      control={control}
      name="pdfPath"
      label={text.pdf}
      required
      render={(field) => (
        <BookletUploader
          id={field.name}
          value={uploaded}
          upload={upload}
          onChange={(pdf) => {
            setUploaded(pdf);
            setValue('id', attemptId.current);
            field.onChange(pdf.path);
          }}
        />
      )}
    />
  );
}

function SavedPdf({ pageCount }: { pageCount: number }) {
  return (
    <div className="space-y-1">
      <p className="text-body-sm font-medium">
        {text.pdf}: {text.pages(pageCount)}
      </p>
      <p className="text-caption text-muted-foreground">{text.replaceHint}</p>
    </div>
  );
}

function DetailFields({ control }: { control: BookletControl }) {
  const title = useWatch({ control, name: 'title' });
  return (
    <>
      <TextField
        control={control}
        name="title"
        label={text.titleField}
        required
        maxLength={CMS_LIMITS.bookletTitle}
      />
      <FormField
        control={control}
        name="slug"
        label={common.slug}
        description={common.slugHint}
        required
        render={(field) => <SlugInput {...field} source={title} prefix={PUBLIC_PREFIX} />}
      />
      <TextField
        control={control}
        name="description"
        label={text.descriptionField}
        maxLength={CMS_LIMITS.bookletDescription}
        multiline
      />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <SelectField
          control={control}
          name="kind"
          label={text.kind}
          required
          options={KIND_OPTIONS}
        />
        <StatusField control={control} name="status" />
      </div>
    </>
  );
}

// Task P2.9.06, docs/PRD.md FR-ADMIN-12: a booklet, new with its PDF or as it is, inside its sheet (Task P4.3.03).
export function BookletForm({ booklet, savedPageCount, owner, action, onSaved }: BookletFormProps) {
  const router = useRouter();
  const [initial] = useState(booklet);
  const form = useForm({ resolver: zodResolver(saveBookletSchema), defaultValues: initial });
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
        {savedPageCount === null ? (
          <PdfField control={form.control} setValue={form.setValue} owner={owner} />
        ) : (
          <SavedPdf pageCount={savedPageCount} />
        )}
        <DetailFields control={form.control} />
        <Button type="submit" loading={form.formState.isSubmitting}>
          {common.save}
        </Button>
      </PostForm>
    </Form>
  );
}
