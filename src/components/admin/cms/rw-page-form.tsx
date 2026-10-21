'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useForm, type Control } from 'react-hook-form';
import { toast } from 'sonner';

import { ImagePathField } from '@/components/admin/cms/image-path-field';
import { NumberField } from '@/components/admin/cms/number-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PhoneInput } from '@/components/forms/phone-input';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CMS_LIMITS } from '@/config/cms';
import { useActionForm } from '@/hooks/use-action-form';
import { copy } from '@/lib/copy/id';
import { createImageUpload } from '@/lib/uploads/upload-client';
import { updateRwPageSchema, type UpdateRwPageInput } from '@/lib/validations/rw-page';
import type { ActionResult } from '@/types/action-result';
import type { RwPageAdmin } from '@/types/cms';

const text = copy.cms.pages;
const common = copy.cms.common;

const FIELDS = [
  'tagline',
  'descriptionMd',
  'visionMd',
  'heroImagePath',
  'contactPhone',
  'contactEmail',
  'mapLat',
  'mapLng',
] as const;

export interface RwPageFormProps {
  page: RwPageAdmin;
  // updateRwPageAction, handed in by the page.
  action: (values: unknown) => Promise<ActionResult<RwPageAdmin>>;
}

function toFormValues(page: RwPageAdmin): UpdateRwPageInput {
  return {
    tagline: page.tagline ?? '',
    descriptionMd: page.descriptionMd ?? '',
    visionMd: page.visionMd ?? '',
    heroImagePath: page.heroImagePath,
    contactPhone: page.contactPhone ?? '',
    contactEmail: page.contactEmail ?? '',
    mapLat: page.mapLat,
    mapLng: page.mapLng,
  };
}

type FormControl = Control<UpdateRwPageInput>;

function ProfileFields({ control }: { control: FormControl }) {
  return (
    <>
      <FormField
        control={control}
        name="tagline"
        label={text.tagline}
        render={(field) => (
          <Input {...field} value={field.value ?? ''} maxLength={CMS_LIMITS.tagline} />
        )}
      />
      <FormField
        control={control}
        name="descriptionMd"
        label={text.descriptionMd}
        description={common.markdownHint}
        render={(field) => (
          <Textarea {...field} value={field.value ?? ''} maxLength={CMS_LIMITS.longText} />
        )}
      />
      <FormField
        control={control}
        name="visionMd"
        label={text.visionMd}
        render={(field) => (
          <Textarea {...field} value={field.value ?? ''} maxLength={CMS_LIMITS.longText} />
        )}
      />
    </>
  );
}

// rw_units has no upload folder of its own, so the page photo is a gallery photo of the RW.
function HeroImageField({
  control,
  rwId,
  name,
}: { control: FormControl } & Pick<RwPageAdmin, 'rwId' | 'name'>) {
  const upload = useMemo(() => createImageUpload({ rwId, purpose: 'gallery' }), [rwId]);
  return (
    <FormField
      control={control}
      name="heroImagePath"
      label={text.heroImage}
      render={(field) => (
        <ImagePathField value={field.value} onChange={field.onChange} upload={upload} alt={name} />
      )}
    />
  );
}

function ContactFields({ control }: { control: FormControl }) {
  return (
    <>
      <FormField
        control={control}
        name="contactPhone"
        label={text.contactPhone}
        render={(field) => <PhoneInput {...field} value={field.value ?? ''} />}
      />
      <FormField
        control={control}
        name="contactEmail"
        label={text.contactEmail}
        render={(field) => (
          <Input {...field} type="email" autoComplete="email" value={field.value ?? ''} />
        )}
      />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name="mapLat"
          label={text.mapLat}
          description={text.mapHint}
          render={(field) => <NumberField {...field} />}
        />
        <FormField
          control={control}
          name="mapLng"
          label={text.mapLng}
          render={(field) => <NumberField {...field} />}
        />
      </div>
    </>
  );
}

// Task P2.9.06, docs/PRD.md FR-ADMIN-15: the content columns of the RW's public page.
export function RwPageForm({ page, action }: RwPageFormProps) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(updateRwPageSchema),
    defaultValues: toFormValues(page),
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: FIELDS,
    onSuccess: (saved) => {
      form.reset(toFormValues(saved));
      toast.success(common.saved(text.noun));
      router.refresh();
    },
  });

  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <ProfileFields control={form.control} />
        <HeroImageField control={form.control} rwId={page.rwId} name={page.name} />
        <ContactFields control={form.control} />
        <Button
          type="submit"
          loading={form.formState.isSubmitting}
          disabled={!form.formState.isDirty}
        >
          {common.save}
        </Button>
      </PostForm>
    </Form>
  );
}
