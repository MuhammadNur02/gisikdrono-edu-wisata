'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

import { CheckboxField, TextField } from '@/components/admin/cms/fields';
import { FormSection } from '@/components/admin/cms/form-section';
import { StepUpDialog } from '@/components/admin/shell/step-up-dialog';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import {
  CATALOGUE_SETTING_NAMES,
  SETTING_LIMITS as LIMITS,
  type CatalogueSettingName,
} from '@/config/site-settings';
import { settingsCopy } from '@/lib/copy/settings';
import { showFieldErrors } from '@/lib/utils/form-errors';
import {
  catalogueSettingsSchema,
  type CatalogueSettingsInput,
  type CatalogueSettingsValues,
} from '@/lib/validations/settings';
import type { ActionResult } from '@/types/action-result';
import type { CatalogueSettingsAdmin } from '@/types/settings';

const text = settingsCopy;

type CatalogueForm = UseFormReturn<CatalogueSettingsInput, unknown, CatalogueSettingsValues>;

export interface CatalogueSettingsFormProps {
  settings: CatalogueSettingsAdmin;
  // updateCatalogueSettingsAction and verifyStaffTotpAction, handed in by the page.
  saveAction: (values: unknown) => Promise<ActionResult<number>>;
  verifyAction: (values: unknown) => Promise<ActionResult<null>>;
}

// A field's label, marked while it still holds the seeded placeholder.
function describe(name: CatalogueSettingName, placeholders: readonly CatalogueSettingName[]) {
  const field: { label: string; description?: string } = text.fields[name];
  if (!placeholders.includes(name)) return field;
  return {
    label: field.label,
    description: [text.placeholder, field.description].filter(Boolean).join('. '),
  };
}

// The save that runs once the step-up code is verified: its refusal goes above the form and under the fields.
function useSave(form: CatalogueForm, saveAction: CatalogueSettingsFormProps['saveAction']) {
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const save = async (values: CatalogueSettingsValues) => {
    setFailure(null);
    const result = await saveAction(values);
    if (!result.ok) {
      showFieldErrors(form.setError, CATALOGUE_SETTING_NAMES, result.error.fieldErrors);
      setFailure(result.error.message);
      return;
    }
    toast.success(text.saved(result.data));
    form.reset(values);
    router.refresh();
  };
  return { save, failure };
}

function CatalogueFields({
  form,
  placeholders,
}: {
  form: CatalogueForm;
  placeholders: readonly CatalogueSettingName[];
}) {
  return (
    <FormSection title={text.groups.catalogue}>
      <TextField
        control={form.control}
        name="kopdesWhatsappNumber"
        maxLength={LIMITS.shortText}
        required
        {...describe('kopdesWhatsappNumber', placeholders)}
      />
      <TextField
        control={form.control}
        name="kopdesAddress"
        maxLength={LIMITS.address}
        multiline
        required
        {...describe('kopdesAddress', placeholders)}
      />
      <CheckboxField
        control={form.control}
        name="showProductPrices"
        {...text.fields.showProductPrices}
      />
    </FormSection>
  );
}

// The authenticator code asked for right before the save (AUTH-11).
function SaveStepUp({
  pending,
  onCancel,
  verifyAction,
  onVerified,
}: {
  pending: CatalogueSettingsValues | null;
  onCancel: () => void;
  verifyAction: CatalogueSettingsFormProps['verifyAction'];
  onVerified: (values: CatalogueSettingsValues) => Promise<void>;
}) {
  return (
    <StepUpDialog
      open={pending !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
      title={text.stepUp.title}
      description={text.stepUp.description}
      confirmLabel={text.stepUp.confirm}
      verifyAction={verifyAction}
      onVerified={async () => {
        if (pending !== null) await onVerified(pending);
      }}
    />
  );
}

// docs/PRD.md §13.1 A30, Pengaturan Katalog: the Kopdes admin's three keys, saved like the superadmin's whole form,
// with an authenticator code right before the save; the action and the database check both again.
export function CatalogueSettingsForm({
  settings,
  saveAction,
  verifyAction,
}: CatalogueSettingsFormProps) {
  const form = useForm({
    resolver: zodResolver(catalogueSettingsSchema),
    defaultValues: settings.values,
  });
  const [pending, setPending] = useState<CatalogueSettingsValues | null>(null);
  const { save, failure } = useSave(form, saveAction);
  const submit = form.handleSubmit((values) => {
    setPending(values);
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        {settings.placeholders.length > 0 ? (
          <FormAlert tone="info">{text.placeholderHint}</FormAlert>
        ) : null}
        <CatalogueFields form={form} placeholders={settings.placeholders} />
        <Button type="submit" size="lg" disabled={!form.formState.isDirty}>
          {text.catalogue.save}
        </Button>
      </PostForm>
      <SaveStepUp
        pending={pending}
        onCancel={() => {
          setPending(null);
        }}
        verifyAction={verifyAction}
        onVerified={async (values) => {
          setPending(null);
          await save(values);
        }}
      />
    </Form>
  );
}
