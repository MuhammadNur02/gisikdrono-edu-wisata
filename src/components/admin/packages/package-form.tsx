'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { SaveButton } from '@/components/admin/cms/save-button';
import { withRowId } from '@/components/admin/cms/schedule-values';
import {
  BasicsFields,
  PublishFields,
  VisitFields,
  type PackageControl,
} from '@/components/admin/packages/package-fields';
import { ItinerarySection } from '@/components/admin/packages/package-legs';
import { PhotosSection } from '@/components/admin/packages/package-photos';
import { PricingSection, type RwOption } from '@/components/admin/packages/package-tiers';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { Form } from '@/components/ui/form';
import { PACKAGE_PATHS } from '@/config/packages';
import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import { useActionForm } from '@/hooks/use-action-form';
import { packagesCopy } from '@/lib/copy/packages';
import { comboMayPublish } from '@/lib/utils/package-tiers';
import { createPackageSchema, type PackageInput } from '@/lib/validations/package';
import type { ActionResult } from '@/types/action-result';
import type { PackageAdmin } from '@/types/package';

const text = packagesCopy;
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
  'legRwIds',
] as const;

// The legs editor loads only for a combo, outside the package pages' first load (admin budget).
const ComboLegsEditor = dynamic(() =>
  import('@/components/admin/packages/combo-legs').then((module) => module.ComboLegsEditor),
);

type PackageAction = (values: unknown) => Promise<ActionResult<PackageAdmin>>;

// The row a saved package is: its owner's folder and its id for its photos. None before the first save.
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

// A combo's route (Task P4.3.05, P4.3.11); it goes on sale once it visits two RWs.
function ComboRoute({
  control,
  rwOptions,
}: Pick<PackageFormProps, 'rwOptions'> & { control: PackageControl }) {
  const category = useWatch({ control, name: 'category' });
  if (category !== 'combo') return null;
  return <ComboLegsEditor control={control} rwOptions={rwOptions} />;
}

function useCanPublish(control: PackageControl): boolean {
  const category = useWatch({ control, name: 'category' });
  const legRwIds = useWatch({ control, name: 'legRwIds' });
  return category !== 'combo' || comboMayPublish(legRwIds);
}

function PackageSections({
  control,
  stored,
  categories,
  rwOptions,
}: Pick<PackageFormProps, 'stored' | 'categories' | 'rwOptions'> & { control: PackageControl }) {
  const name = useWatch({ control, name: 'name' });
  const canPublish = useCanPublish(control);
  return (
    <>
      <BasicsFields control={control} categories={categories} />
      <ComboRoute control={control} rwOptions={rwOptions} />
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
      <PublishFields control={control} canPublish={canPublish} />
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
export function PackageForm({ initial, action, stored, readOnly, ...options }: PackageFormProps) {
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
            <PackageSections control={form.control} stored={stored} {...options} />
          </fieldset>
          {readOnly ? null : <SaveButton isSubmitting={form.formState.isSubmitting} />}
        </PostForm>
      </div>
    </Form>
  );
}
