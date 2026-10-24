'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch, type Control } from 'react-hook-form';
import { toast } from 'sonner';

import { CheckboxField, TextField } from '@/components/admin/cms/fields';
import { withRowId } from '@/components/admin/cms/schedule-values';
import { SaveButton } from '@/components/admin/packages/package-form';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { SlugInput } from '@/components/forms/slug-input';
import { Form } from '@/components/ui/form';
import { VENDOR_LIMITS } from '@/config/products';
import { useActionForm } from '@/hooks/use-action-form';
import { copy } from '@/lib/copy/id';
import { productsCopy } from '@/lib/copy/products';
import { createVendorSchema, type VendorInput } from '@/lib/validations/product';
import type { ActionResult } from '@/types/action-result';
import type { VendorAdmin } from '@/types/vendor';

const text = productsCopy.vendors;
const FIELDS = ['name', 'slug', 'ownerName', 'phone', 'descriptionMd', 'isActive'] as const;
// E.164: `+62` and up to 13 digits.
const PHONE_MAX_LENGTH = 16;

export type VendorAction = (values: unknown) => Promise<ActionResult<VendorAdmin>>;

export interface VendorFormProps {
  initial: VendorInput;
  // createVendorAction for a new vendor, updateVendorAction for one that exists.
  action: VendorAction;
  vendorId: string | null;
  onSaved: () => void;
}

function SlugField({ control }: { control: Control<VendorInput> }) {
  const name = useWatch({ control, name: 'name' });
  return (
    <FormField
      control={control}
      name="slug"
      label={text.fields.slug}
      description={copy.cms.common.slugHint}
      required
      render={(field) => <SlugInput {...field} source={name} prefix="" />}
    />
  );
}

function VendorFields({ control }: { control: Control<VendorInput> }) {
  const fields = text.fields;
  return (
    <>
      <TextField
        control={control}
        name="name"
        label={fields.name}
        maxLength={VENDOR_LIMITS.name}
        required
      />
      <SlugField control={control} />
      <TextField
        control={control}
        name="ownerName"
        label={fields.ownerName}
        maxLength={VENDOR_LIMITS.ownerName}
      />
      <TextField
        control={control}
        name="phone"
        label={fields.phone}
        description={fields.phoneHint}
        maxLength={PHONE_MAX_LENGTH}
      />
      <TextField
        control={control}
        name="descriptionMd"
        label={fields.descriptionMd}
        maxLength={VENDOR_LIMITS.descriptionMd}
        multiline
      />
      <CheckboxField control={control} name="isActive" label={fields.isActive} />
    </>
  );
}

// Task P4.3.06: one UMKM vendor, superadmin only (decision of 2026-10-24). Its bank columns wait for their RPCs.
export function VendorForm({ initial, action, vendorId, onSaved }: VendorFormProps) {
  const form = useForm({ resolver: zodResolver(createVendorSchema), defaultValues: initial });
  const send: VendorAction = vendorId ? (values) => action(withRowId(values, vendorId)) : action;
  const { submit, failure } = useActionForm({
    form,
    action: send,
    fields: FIELDS,
    onSuccess: () => {
      toast.success(text.saved);
      onSaved();
    },
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <VendorFields control={form.control} />
        <FormAlert tone="info">{text.bankDeferred}</FormAlert>
        <SaveButton isSubmitting={form.formState.isSubmitting} />
      </PostForm>
    </Form>
  );
}
