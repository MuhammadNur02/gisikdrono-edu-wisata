'use client';

import { useMemo } from 'react';
import { useController, useWatch, type Control } from 'react-hook-form';

import {
  CheckboxField,
  NumberInputField,
  SelectField,
  SortOrderField,
  TextField,
} from '@/components/admin/cms/fields';
import { FormSection } from '@/components/admin/cms/form-section';
import { MoneyField } from '@/components/admin/cms/money-field';
import { PhotoListField } from '@/components/admin/cms/photo-list-field';
import { FormField } from '@/components/forms/form-field';
import { SlugInput } from '@/components/forms/slug-input';
import { PRODUCT_LIMITS, PRODUCT_PATHS } from '@/config/products';
import type { RwId } from '@/config/rw';
import { CONTENT_STATUS, PRODUCT_CATEGORY } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { productsCopy } from '@/lib/copy/products';
import { createImageUpload } from '@/lib/uploads/upload-client';
import { PRODUCT_STATUSES, type ProductInput } from '@/lib/validations/product';

const text = productsCopy;
const fields = text.fields;

export type ProductControl = Control<ProductInput>;

const CATEGORY_OPTIONS = DB_ENUMS.product_category.map((category) => ({
  value: category,
  label: PRODUCT_CATEGORY[category].label,
}));
const STATUS_OPTIONS = PRODUCT_STATUSES.map((status) => ({
  value: status,
  label: CONTENT_STATUS[status].label,
}));

export interface VendorOption {
  value: string;
  label: string;
}

function SlugField({ control }: { control: ProductControl }) {
  const name = useWatch({ control, name: 'name' });
  return (
    <FormField
      control={control}
      name="slug"
      label={fields.slug}
      description={copy.cms.common.slugHint}
      required
      render={(field) => <SlugInput {...field} source={name} prefix={PRODUCT_PATHS.publicPrefix} />}
    />
  );
}

export function ProductBasics({
  control,
  vendors,
}: {
  control: ProductControl;
  vendors: readonly VendorOption[];
}) {
  return (
    <FormSection title={text.sections.basics}>
      <SelectField
        control={control}
        name="vendorId"
        label={fields.vendor}
        options={vendors}
        required
      />
      <TextField
        control={control}
        name="name"
        label={fields.name}
        maxLength={PRODUCT_LIMITS.name}
        required
      />
      <SlugField control={control} />
      <CategoryAndDescription control={control} />
    </FormSection>
  );
}

function CategoryAndDescription({ control }: { control: ProductControl }) {
  return (
    <>
      <SelectField
        control={control}
        name="category"
        label={fields.category}
        options={CATEGORY_OPTIONS}
        required
      />
      <TextField
        control={control}
        name="descriptionMd"
        label={fields.descriptionMd}
        description={copy.cms.common.markdownHint}
        maxLength={PRODUCT_LIMITS.descriptionMd}
        multiline
      />
    </>
  );
}

export function ProductOrdering({ control }: { control: ProductControl }) {
  return (
    <FormSection title={text.sections.order}>
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField control={control} name="price" label={fields.price} required />
        <TextField
          control={control}
          name="unitLabel"
          label={fields.unitLabel}
          description={fields.unitLabelHint}
          maxLength={PRODUCT_LIMITS.unitLabel}
          required
        />
        <NumberInputField
          control={control}
          name="minOrderQty"
          label={fields.minOrderQty}
          required
        />
        <NumberInputField control={control} name="maxOrderQty" label={fields.maxOrderQty} />
      </div>
      <NumberInputField
        control={control}
        name="leadTimeDays"
        label={fields.leadTimeDays}
        description={fields.leadTimeDaysHint}
        emptyAs={0}
      />
      <p className="text-body-sm text-muted-foreground">{fields.addonNote}</p>
      <CheckboxField control={control} name="isAvailable" label={fields.isAvailable} />
    </FormSection>
  );
}

export function ProductPublishing({ control }: { control: ProductControl }) {
  return (
    <FormSection title={text.sections.publish}>
      <SelectField
        control={control}
        name="status"
        label={fields.status}
        options={STATUS_OPTIONS}
        required
      />
      <CheckboxField control={control} name="isFeatured" label={fields.isFeatured} />
      <SortOrderField control={control} name="sortOrder" />
    </FormSection>
  );
}

// products_umkm.image_paths (docs/Security.md R34): the first photo is the cover; the folder is the product's own.
export function ProductPhotos({
  control,
  rwId,
  productId,
}: {
  control: ProductControl;
  rwId: RwId;
  productId: string;
}) {
  const { field } = useController({ control, name: 'imagePaths' });
  const name = useWatch({ control, name: 'name' });
  const upload = useMemo(
    () => createImageUpload({ rwId, purpose: 'product', entityId: productId }),
    [rwId, productId],
  );
  return (
    <FormSection title={text.sections.photos}>
      <p className="text-body-sm text-muted-foreground">{text.photos.hint}</p>
      <PhotoListField
        paths={field.value}
        onChange={field.onChange}
        upload={upload}
        alt={name}
        max={PRODUCT_LIMITS.images}
        addLabel={text.photos.add}
        removeLabel={text.photos.remove}
        maxReached={text.photos.max(PRODUCT_LIMITS.images)}
      />
    </FormSection>
  );
}
