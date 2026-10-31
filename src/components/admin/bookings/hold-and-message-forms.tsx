'use client';

import { TZDate } from '@date-fns/tz';
import { zodResolver } from '@hookform/resolvers/zod';
import { MessageSquareOff } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { OptionSelect } from '@/components/admin/finance/option-select';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { APP_TZ } from '@/config/site';
import { useActionForm } from '@/hooks/use-action-form';
import { bookingStaffCopy } from '@/lib/copy/booking-staff';
import { formatDateTimeShort } from '@/lib/utils/dates';
import { resendMessageSchema } from '@/lib/validations/booking-staff';
import type { ActionResult } from '@/types/action-result';
import type { ResendOption } from '@/types/booking-staff';

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

interface ResendMessageFormProps extends StepFormProps {
  options: readonly ResendOption[];
}

type ResendChoice = Pick<ResendOption, 'template'> & {
  channel: ResendOption['channels'][number]['channel'];
};

function channelLabel(option: ResendOption['channels'][number]): string {
  const name = text.resend.channels[option.channel];
  return option.lastQueuedAt === null
    ? text.resend.firstSend(name)
    : text.resend.lastQueued(name, formatDateTimeShort(option.lastQueuedAt));
}

function channelsOf(options: readonly ResendOption[], template: string) {
  return options.find((option) => option.template === template)?.channels ?? [];
}

function templateChoicesOf(options: readonly ResendOption[]) {
  return options.map((option) => ({
    value: option.template,
    label: text.resend.templates[option.template],
  }));
}

function channelChoicesOf(channels: readonly ResendOption['channels'][number][]) {
  return channels.map((option) => ({ value: option.channel, label: channelLabel(option) }));
}

function useResendForm({
  bookingId,
  action,
  onDone,
  first,
}: StepFormProps & { first: ResendChoice }) {
  const form = useForm({
    resolver: zodResolver(resendMessageSchema),
    defaultValues: { bookingId, ...first },
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
  description?: string;
  options: readonly { value: string; label: string }[];
  onPicked?: (value: string) => void;
}) {
  return (
    <FormField
      control={props.form.control}
      name={props.name}
      label={props.label}
      description={props.description}
      required
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value}
          onChange={(value) => {
            field.onChange(value);
            props.onPicked?.(value);
          }}
          options={props.options}
          placeholder={props.label}
          trigger={field}
        />
      )}
    />
  );
}

function ResendPicker({
  options,
  first,
  ...props
}: ResendMessageFormProps & { first: ResendChoice }) {
  const { form, submit, failure } = useResendForm({ ...props, first });
  const channels = channelsOf(options, form.watch('template'));
  // Another message may go on other channels: the first it may go on is picked for it.
  const pickTemplate = (template: string) => {
    const firstChannel = channelsOf(options, template)[0];
    if (firstChannel) form.setValue('channel', firstChannel.channel);
  };
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <PickerField
          form={form}
          name="template"
          label={text.resend.template}
          options={templateChoicesOf(options)}
          onPicked={pickTemplate}
        />
        <PickerField
          form={form}
          name="channel"
          label={text.resend.channel}
          description={text.resend.channelHint}
          options={channelChoicesOf(channels)}
        />
        <Button type="submit" className="min-h-11 w-full" loading={form.formState.isSubmitting}>
          {text.resend.submit}
        </Button>
      </PostForm>
    </Form>
  );
}

// Only the messages request_notification_resend would send now (resendOptionsFor); with none, why not.
export function ResendMessageForm(props: ResendMessageFormProps) {
  const firstOption = props.options[0];
  const firstChannel = firstOption?.channels[0];
  if (!firstOption || !firstChannel) {
    return (
      <EmptyState
        icon={MessageSquareOff}
        title={text.resend.emptyTitle}
        description={text.resend.emptyHint}
      />
    );
  }
  return (
    <ResendPicker
      {...props}
      first={{ template: firstOption.template, channel: firstChannel.channel }}
    />
  );
}
