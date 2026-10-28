'use client';

import { TZDate } from '@date-fns/tz';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { OptionSelect } from '@/components/admin/finance/option-select';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RESENDABLE_TEMPLATES } from '@/config/bookings';
import { APP_TZ } from '@/config/site';
import { useActionForm } from '@/hooks/use-action-form';
import { bookingStaffCopy } from '@/lib/copy/booking-staff';
import { resendMessageSchema } from '@/lib/validations/booking-staff';
import type { ActionResult } from '@/types/action-result';

const text = bookingStaffCopy;

type StepAction = (input: unknown) => Promise<ActionResult<null>>;

export interface StepFormProps {
  bookingId: string;
  action: StepAction;
  onDone: () => void;
}

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// A datetime-local value is read as WIB (APP_TZ), whatever the officer's device says, and sent as an ISO instant.
function wibInstantOf(localValue: string): string | null {
  const parts = LOCAL_DATE_TIME.exec(localValue);
  if (!parts) return null;
  const [year, month, day, hour, minute] = parts.slice(1).map(Number);
  if ([year, month, day, hour, minute].some((part) => part === undefined)) return null;
  return new TZDate(
    year ?? 0,
    (month ?? 1) - 1,
    day ?? 1,
    hour ?? 0,
    minute ?? 0,
    APP_TZ,
  ).toISOString();
}

export function ExtendHoldForm({ bookingId, action, onDone }: StepFormProps) {
  const form = useForm({ defaultValues: { localValue: '' } });
  const { submit, failure } = useActionForm({
    form,
    action: (values) => {
      const typed =
        typeof values === 'object' && values !== null && 'localValue' in values
          ? String(values.localValue)
          : '';
      return action({ bookingId, newExpiresAt: wibInstantOf(typed) ?? '' });
    },
    fields: ['localValue'],
    onSuccess: onDone,
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="localValue"
          label={text.extend.field}
          description={text.extend.hint}
          required
          render={(field) => <Input {...field} type="datetime-local" className="h-11" />}
        />
        <Button type="submit" className="min-h-11 w-full" loading={form.formState.isSubmitting}>
          {text.extend.submit}
        </Button>
      </PostForm>
    </Form>
  );
}

const TEMPLATE_OPTIONS = RESENDABLE_TEMPLATES.map((template) => ({
  value: template,
  label: text.resend.templates[template],
}));
const CHANNEL_OPTIONS = (['whatsapp', 'email'] as const).map((channel) => ({
  value: channel,
  label: text.resend.channels[channel],
}));

function useResendForm({ bookingId, action, onDone }: StepFormProps) {
  const form = useForm({
    resolver: zodResolver(resendMessageSchema),
    defaultValues: { bookingId, template: 'booking_created' as const, channel: 'email' as const },
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['template', 'channel'],
    onSuccess: onDone,
  });
  return { form, submit, failure };
}

type ResendForm = ReturnType<typeof useResendForm>['form'];

function PickerField(props: {
  form: ResendForm;
  name: 'template' | 'channel';
  label: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <FormField
      control={props.form.control}
      name={props.name}
      label={props.label}
      required
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value}
          onChange={field.onChange}
          options={props.options}
          placeholder={props.label}
          trigger={field}
        />
      )}
    />
  );
}

export function ResendMessageForm(props: StepFormProps) {
  const { form, submit, failure } = useResendForm(props);
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <PickerField
          form={form}
          name="template"
          label={text.resend.template}
          options={TEMPLATE_OPTIONS}
        />
        <PickerField
          form={form}
          name="channel"
          label={text.resend.channel}
          options={CHANNEL_OPTIONS}
        />
        <Button type="submit" className="min-h-11 w-full" loading={form.formState.isSubmitting}>
          {text.resend.submit}
        </Button>
      </PostForm>
    </Form>
  );
}
