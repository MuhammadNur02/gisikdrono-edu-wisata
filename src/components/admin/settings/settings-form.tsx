'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

import {
  BookingSettings,
  ChannelSettings,
  CheckinSettings,
  ContactSettings,
  DocumentSettings,
  FinanceSettings,
} from '@/components/admin/settings/settings-fields';
import { StepUpDialog } from '@/components/admin/shell/step-up-dialog';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { settingsCopy } from '@/lib/copy/settings';
import { showFieldErrors } from '@/lib/utils/form-errors';
import {
  siteSettingsSchema,
  type SiteSettingsInput,
  type SiteSettingsValues,
} from '@/lib/validations/settings';
import type { ActionResult } from '@/types/action-result';
import type { SiteSettingsAdmin } from '@/types/settings';

const text = settingsCopy;
const FIELDS = siteSettingsSchema.keyof().options;

type SettingsForm = UseFormReturn<SiteSettingsInput, unknown, SiteSettingsValues>;

export interface SettingsFormProps {
  settings: SiteSettingsAdmin;
  // updateSiteSettingsAction and verifyStaffTotpAction, handed in by the page.
  saveAction: (values: unknown) => Promise<ActionResult<number>>;
  verifyAction: (values: unknown) => Promise<ActionResult<null>>;
}

// The save that runs once the step-up code is verified: its refusal goes above the form and under the fields.
function useSave(form: SettingsForm, saveAction: SettingsFormProps['saveAction']) {
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const save = async (values: SiteSettingsValues) => {
    setFailure(null);
    const result = await saveAction(values);
    if (!result.ok) {
      showFieldErrors(form.setError, FIELDS, result.error.fieldErrors);
      setFailure(result.error.message);
      return;
    }
    toast.success(text.saved(result.data));
    form.reset(values);
    router.refresh();
  };
  return { save, failure };
}

function SettingsGroups({ form, settings }: { form: SettingsForm; settings: SiteSettingsAdmin }) {
  const group = { control: form.control, placeholders: settings.placeholders };
  return (
    <>
      <BookingSettings {...group} bookingEnabled={settings.bookingEnabled} />
      <ChannelSettings {...group} />
      <CheckinSettings {...group} />
      <FinanceSettings {...group} />
      <ContactSettings {...group} />
      <DocumentSettings {...group} />
    </>
  );
}

// Task P4.9.01, docs/PRD.md §8.6: the superadmin's typed form over site_settings. The browser checks the values first,
// then asks for an authenticator code (AUTH-11) and saves right after it; the action and the database check both again.
export function SettingsForm({ settings, saveAction, verifyAction }: SettingsFormProps) {
  const form = useForm({
    resolver: zodResolver(siteSettingsSchema),
    defaultValues: settings.values,
  });
  const [pending, setPending] = useState<SiteSettingsValues | null>(null);
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
        <SettingsGroups form={form} settings={settings} />
        <Button type="submit" size="lg" disabled={!form.formState.isDirty}>
          {text.save}
        </Button>
      </PostForm>
      <StepUpDialog
        open={pending !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPending(null);
        }}
        title={text.stepUp.title}
        description={text.stepUp.description}
        confirmLabel={text.stepUp.confirm}
        verifyAction={verifyAction}
        onVerified={async () => {
          if (pending === null) return;
          setPending(null);
          await save(pending);
        }}
      />
    </Form>
  );
}
