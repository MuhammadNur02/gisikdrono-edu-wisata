'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { withRowId } from '@/components/admin/cms/schedule-values';
import {
  BasicsFields,
  PublishFields,
  VisitFields,
  type PackageControl,
} from '@/components/admin/packages/package-fields';
import { ItinerarySection, LegsSection } from '@/components/admin/packages/package-legs';
import { PhotosSection } from '@/components/admin/packages/package-photos';
import { PricingSection, type RwOption } from '@/components/admin/packages/package-tiers';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { PACKAGE_PATHS } from '@/config/packages';
import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import { useActionForm } from '@/hooks/use-action-form';
import { copy } from '@/lib/copy/id';
import { createPackageSchema, type PackageInput } from '@/lib/validations/package';
import type { ActionResult } from '@/types/action-result';
import type { PackageAdmin } from '@/types/package';

const text = copy.packages;
const FIELDS = [
  'name',
  'slug',
  'category',
  'tagline',
  'descriptionMd',
  'highlights',
  'inclusions',
  'itinerary',
  'durationMinutes',
  'pricingBasis',
  'pricePerPax',
  'flatPrice',
  'minPax',
  'maxPax',
  'imagePaths',
  'isFeatured',
  'status',
  'sortOrder',
  'validFrom',
  'validTo',
  'priceTiers',
  'legs',
] as const;

type PackageAction = (values: unknown) => Promise<ActionResult<PackageAdmin>>;

// The row a saved package is, for its photos: its owner's folder and its id. None before the first save.
export interface StoredPackage {
  id: string;
  owner: RwId | null;
}

export interface PackageFormProps {
  initial: PackageInput;
  // createPackageAction for a new package, updatePackageAction for one that exists.
  action: PackageAction;
  stored: StoredPackage | null;
  categories: readonly EnumValue<'package_category'>[];
  rwOptions: readonly RwOption[];
  // An RW admin opening a combo reads it; only the superadmin changes it.
  readOnly: boolean;
}

function ComboSections({
  control,
  rwOptions,
}: {
  control: PackageControl;
  rwOptions: readonly RwOption[];
}) {
  const category = useWatch({ control, name: 'category' });
  return category === 'combo' ? <LegsSection control={control} rwOptions={rwOptions} /> : null;
}

function PackageSections({
  control,
  stored,
  categories,
  rwOptions,
}: Pick<PackageFormProps, 'stored' | 'categories' | 'rwOptions'> & { control: PackageControl }) {
  const name = useWatch({ control, name: 'name' });
  return (
    <>
      <BasicsFields control={control} categories={categories} />
      <ComboSections control={control} rwOptions={rwOptions} />
      <VisitFields control={control} />
      <PricingSection control={control} />
      <ItinerarySection control={control} rwOptions={rwOptions} />
      {stored ? (
        <PhotosSection
          control={control}
          owner={stored.owner}
          packageId={stored.id}
          packageName={name}
        />
      ) : (
        <FormAlert tone="info">{text.photos.hint}</FormAlert>
      )}
      <PublishFields control={control} />
    </>
  );
}

function useSavedNavigation(stored: StoredPackage | null) {
  const router = useRouter();
  return (saved: PackageAdmin) => {
    if (stored === null) {
      toast.success(text.savedThenPhotos);
      router.push(PACKAGE_PATHS.edit(saved.id));
      return;
    }
    toast.success(text.saved);
    router.refresh();
  };
}

// Task P4.3.05, docs/PRD.md FR-ADMIN-05: a package on its own page, section by section. Prices are integer rupiah
// as typed; the database adds the price floor and records every price change.
export function PackageForm({
  initial,
  action,
  stored,
  categories,
  rwOptions,
  readOnly,
}: PackageFormProps) {
  const [defaults] = useState(initial);
  const form = useForm({ resolver: zodResolver(createPackageSchema), defaultValues: defaults });
  const send: PackageAction = stored ? (values) => action(withRowId(values, stored.id)) : action;
  const { submit, failure } = useActionForm({
    form,
    action: send,
    fields: FIELDS,
    onSuccess: useSavedNavigation(stored),
  });
  return (
    <Form {...form}>
      <div className="max-w-3xl">
        <PostForm onSubmit={submit}>
          {readOnly ? <FormAlert tone="info">{text.comboReadOnly}</FormAlert> : null}
          {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
          <fieldset disabled={readOnly} className="space-y-5">
            <PackageSections
              control={form.control}
              stored={stored}
              categories={categories}
              rwOptions={rwOptions}
            />
          </fieldset>
          {readOnly ? null : (
            <Button
              type="submit"
              loading={form.formState.isSubmitting}
              className="w-full sm:w-auto"
            >
              {copy.cms.common.save}
            </Button>
          )}
        </PostForm>
      </div>
    </Form>
  );
}
