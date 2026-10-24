'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useForm, type Control } from 'react-hook-form';
import { toast } from 'sonner';

import {
  CheckboxField,
  DateTimeField,
  OptionalSelectField,
  SortOrderField,
  TextField,
} from '@/components/admin/cms/fields';
import { ImagePathField } from '@/components/admin/cms/image-path-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { CMS_LIMITS } from '@/config/cms';
import { useActionForm } from '@/hooks/use-action-form';
import { copy } from '@/lib/copy/id';
import { createImageUpload } from '@/lib/uploads/upload-client';
import { createHeroBannerSchema, type HeroBannerInput } from '@/lib/validations/hero-banner';
import type { ActionResult } from '@/types/action-result';
import type { BannerProductOption, HeroBannerAdmin } from '@/types/cms';

const text = copy.cms.banners;
const common = copy.cms.common;
const FIELDS = [
  'title',
  'subtitle',
  'ctaLabel',
  'ctaHref',
  'imagePath',
  'mobileImagePath',
  'productId',
  'sortOrder',
  'isActive',
  'startsAt',
  'endsAt',
] as const;

type BannerControl = Control<HeroBannerInput>;

export interface HeroBannerFormProps {
  banner: HeroBannerInput;
  products: BannerProductOption[];
  action: (values: unknown) => Promise<ActionResult<HeroBannerAdmin>>;
  onSaved: () => void;
}

function TextFields({ control }: { control: BannerControl }) {
  return (
    <>
      <TextField
        control={control}
        name="title"
        label={text.titleField}
        required
        maxLength={CMS_LIMITS.bannerTitle}
      />
      <TextField
        control={control}
        name="subtitle"
        label={text.subtitle}
        maxLength={CMS_LIMITS.bannerSubtitle}
      />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <TextField
          control={control}
          name="ctaLabel"
          label={text.ctaLabel}
          maxLength={CMS_LIMITS.bannerCtaLabel}
        />
        <TextField
          control={control}
          name="ctaHref"
          label={text.ctaHref}
          description={text.ctaHrefHint}
          maxLength={CMS_LIMITS.bannerCtaHref}
        />
      </div>
    </>
  );
}

// Banner photos are kelurahan uploads (src/lib/uploads/paths.ts: a hero upload is never an RW's).
function PhotoFields({ control }: { control: BannerControl }) {
  const upload = useMemo(() => createImageUpload({ rwId: null, purpose: 'hero' }), []);
  const fields = [
    { name: 'imagePath', label: text.image, required: true },
    { name: 'mobileImagePath', label: text.mobileImage, required: false },
  ] as const;
  return fields.map((photo) => (
    <FormField
      key={photo.name}
      control={control}
      name={photo.name}
      label={photo.label}
      required={photo.required}
      render={(field) => (
        <ImagePathField
          id={field.name}
          value={field.value}
          onChange={field.onChange}
          upload={upload}
          alt={photo.label}
        />
      )}
    />
  ));
}

function DisplayFields({
  control,
  products,
}: {
  control: BannerControl;
  products: BannerProductOption[];
}) {
  return (
    <>
      <OptionalSelectField
        control={control}
        name="productId"
        label={text.productId}
        noneLabel={text.noProduct}
        options={products.map((product) => ({ value: product.id, label: product.name }))}
      />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <DateTimeField control={control} name="startsAt" label={text.startsAt} />
        <DateTimeField control={control} name="endsAt" label={text.endsAt} />
        <SortOrderField control={control} name="sortOrder" />
        <CheckboxField control={control} name="isActive" label={text.isActive} />
      </div>
    </>
  );
}

// Task P2.9.06, docs/PRD.md FR-ADMIN-23: one home page slide, new or as it is, inside its sheet (Task P4.3.03).
export function HeroBannerForm({ banner, products, action, onSaved }: HeroBannerFormProps) {
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(createHeroBannerSchema), defaultValues: banner });
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
        <TextFields control={form.control} />
        <PhotoFields control={form.control} />
        <DisplayFields control={form.control} products={products} />
        <Button type="submit" loading={form.formState.isSubmitting}>
          {common.save}
        </Button>
      </PostForm>
    </Form>
  );
}
