'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { SaveButton } from '@/components/admin/cms/save-button';
import { withRowId } from '@/components/admin/cms/schedule-values';
import {
  ProductBasics,
  ProductOrdering,
  ProductPhotos,
  ProductPublishing,
  type VendorOption,
} from '@/components/admin/products/product-fields';
import { ProductVariants } from '@/components/admin/products/product-variants-field';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { Form } from '@/components/ui/form';
import { PRODUCT_PATHS } from '@/config/products';
import type { RwId } from '@/config/rw';
import { useActionForm } from '@/hooks/use-action-form';
import { productsCopy } from '@/lib/copy/products';
import { createProductSchema, type ProductInput } from '@/lib/validations/product';
import type { ActionResult } from '@/types/action-result';
import type { ProductAdmin } from '@/types/product';

const text = productsCopy;
const FIELDS = [
  'vendorId',
  'name',
  'slug',
  'category',
  'descriptionMd',
  'price',
  'unitLabel',
  'minOrderQty',
  'maxOrderQty',
  'leadTimeDays',
  'isAddonEligible',
  'isAvailable',
  'isFeatured',
  'imagePaths',
  'status',
  'sortOrder',
  'variants',
] as const;

type ProductAction = (values: unknown) => Promise<ActionResult<ProductAdmin>>;

export interface ProductFormProps {
  initial: ProductInput;
  // createProductAction for a new product, updateProductAction for one that exists.
  action: ProductAction;
  // The saved product, for its photos: its RW's folder and its id. None before the first save.
  stored: { id: string; rwId: RwId } | null;
  vendors: readonly VendorOption[];
  // An RW admin reads their RW's products; only the superadmin changes them (decision of 2026-10-24).
  readOnly: boolean;
}

function useSavedNavigation(isNew: boolean) {
  const router = useRouter();
  return (saved: ProductAdmin) => {
    toast.success(isNew ? text.savedThenPhotos : text.saved);
    if (isNew) {
      router.push(PRODUCT_PATHS.edit(saved.id));
      return;
    }
    router.refresh();
  };
}

// Task P4.3.06, docs/PRD.md FR-ADMIN-06: a UMKM product on its own page. The price is integer rupiah as typed.
export function ProductForm({ initial, action, stored, vendors, readOnly }: ProductFormProps) {
  const [defaults] = useState(initial);
  const form = useForm({ resolver: zodResolver(createProductSchema), defaultValues: defaults });
  const send: ProductAction = stored ? (values) => action(withRowId(values, stored.id)) : action;
  const { submit, failure } = useActionForm({
    form,
    action: send,
    fields: FIELDS,
    onSuccess: useSavedNavigation(stored === null),
  });
  return (
    <Form {...form}>
      <div className="max-w-3xl">
        <PostForm onSubmit={submit}>
          {readOnly ? <FormAlert tone="info">{text.readOnly}</FormAlert> : null}
          {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
          <fieldset disabled={readOnly} className="space-y-5">
            <ProductBasics control={form.control} vendors={vendors} />
            <ProductOrdering control={form.control} />
            {stored ? (
              <ProductPhotos control={form.control} rwId={stored.rwId} productId={stored.id} />
            ) : (
              <FormAlert tone="info">{text.photos.hint}</FormAlert>
            )}
            <ProductVariants control={form.control} />
            <ProductPublishing control={form.control} />
          </fieldset>
          {readOnly ? null : <SaveButton isSubmitting={form.formState.isSubmitting} />}
        </PostForm>
      </div>
    </Form>
  );
}
