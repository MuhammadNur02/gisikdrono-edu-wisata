'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type ControllerRenderProps, type FieldValues } from 'react-hook-form';

import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CSV_ONLY_KINDS, EXPORT_FORMATS, type ExportFormat } from '@/config/exports';
import { DB_ENUMS, type EnumValue } from '@/db/enums';
import { useActionForm } from '@/hooks/use-action-form';
import { exportsCopy as text } from '@/lib/copy/exports';
import { copy } from '@/lib/copy/id';
import { requestExport } from '@/lib/exports/request-export';
import { exportRequestSchema, type ExportRequestInput } from '@/lib/validations/export';
import type { CreatedExport } from '@/types/export';

type ExportKind = EnumValue<'export_kind'>;

const ALL_RWS = 'all';

export interface ExportFormProps {
  isSuperadmin: boolean;
  rwUnits: readonly { id: number; name: string }[];
  // The period the form opens with: the last 30 days up to today, in Semarang.
  defaultFrom: string;
  defaultTo: string;
  onCreated: (created: CreatedExport) => void;
}

interface Option {
  value: string;
  label: string;
}

type TriggerProps = Pick<ControllerRenderProps<FieldValues, string>, 'ref' | 'onBlur'>;

// A Radix select whose trigger carries the field's id and aria attributes (FormField wrapsOwnControl).
function OptionSelect({
  value,
  options,
  onChange,
  trigger,
  isDisabled = false,
}: {
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  trigger: TriggerProps;
  isDisabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={isDisabled}>
      <FormControl>
        <SelectTrigger ref={trigger.ref} onBlur={trigger.onBlur} className="h-11 w-full">
          <SelectValue />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="min-h-11">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function kindsFor(isSuperadmin: boolean): ExportKind[] {
  return isSuperadmin ? [...DB_ENUMS.export_kind] : ['attendance'];
}

function formatsFor(kind: ExportKind): readonly ExportFormat[] {
  return (CSV_ONLY_KINDS as readonly string[]).includes(kind) ? ['csv'] : EXPORT_FORMATS;
}

function useExportForm({ isSuperadmin, defaultFrom, defaultTo, onCreated }: ExportFormProps) {
  const defaultValues: ExportRequestInput = {
    kind: isSuperadmin ? 'visits' : 'attendance',
    format: 'csv',
    from: defaultFrom,
    to: defaultTo,
    rwId: null,
    purpose: '',
  };
  const form = useForm({ resolver: zodResolver(exportRequestSchema), defaultValues });
  const { submit, failure } = useActionForm({
    form,
    action: (values) => requestExport(values, copy.errors.INTERNAL),
    fields: ['kind', 'format', 'from', 'to', 'rwId', 'purpose'],
    onSuccess: onCreated,
  });
  return { form, submit, failure };
}

export type ExportFormControl = ReturnType<typeof useExportForm>['form'];

function KindField({ form, isSuperadmin }: { form: ExportFormControl; isSuperadmin: boolean }) {
  const kind = form.watch('kind');
  return (
    <FormField
      control={form.control}
      name="kind"
      label={text.fields.kind}
      description={text.kindHints[kind]}
      required
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value}
          trigger={field}
          isDisabled={!isSuperadmin}
          options={kindsFor(isSuperadmin).map((value) => ({ value, label: text.kinds[value] }))}
          onChange={(next) => {
            const nextKind = kindsFor(isSuperadmin).find((value) => value === next);
            if (!nextKind) return;
            field.onChange(nextKind);
            // The audit log leaves as CSV only, so choosing it resets an XLSX choice.
            if (!formatsFor(nextKind).includes(form.getValues('format')))
              form.setValue('format', 'csv');
          }}
        />
      )}
    />
  );
}

function FormatField({ form }: { form: ExportFormControl }) {
  const kind = form.watch('kind');
  return (
    <FormField
      control={form.control}
      name="format"
      label={text.fields.format}
      required
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value}
          trigger={field}
          options={formatsFor(kind).map((value) => ({ value, label: text.formats[value] }))}
          onChange={(next) => {
            const nextFormat = EXPORT_FORMATS.find((value) => value === next);
            if (nextFormat) field.onChange(nextFormat);
          }}
        />
      )}
    />
  );
}

function KindAndFormat({ form, isSuperadmin }: { form: ExportFormControl; isSuperadmin: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <KindField form={form} isSuperadmin={isSuperadmin} />
      <FormatField form={form} />
    </div>
  );
}

function PeriodFields({ form }: { form: ExportFormControl }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField
        control={form.control}
        name="from"
        label={text.fields.from}
        required
        render={(field) => <Input {...field} type="date" className="h-11" />}
      />
      <FormField
        control={form.control}
        name="to"
        label={text.fields.to}
        required
        render={(field) => <Input {...field} type="date" className="h-11" />}
      />
    </div>
  );
}

function RwFilter({
  form,
  rwUnits,
}: {
  form: ExportFormControl;
  rwUnits: ExportFormProps['rwUnits'];
}) {
  return (
    <FormField
      control={form.control}
      name="rwId"
      label={text.fields.rw}
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value === null ? ALL_RWS : String(field.value)}
          trigger={field}
          options={[
            { value: ALL_RWS, label: text.fields.rwAll },
            ...rwUnits.map((unit) => ({ value: String(unit.id), label: unit.name })),
          ]}
          onChange={(next) => {
            field.onChange(next === ALL_RWS ? null : Number(next));
          }}
        />
      )}
    />
  );
}

// Task P4.6.03 (docs/Security.md §7.5): kind, format, period, the RW for the superadmin, and the mandatory purpose,
// checked by the same schema the route parses. An RW admin's kind is the attendance of their own RW and nothing else.
export function ExportForm(props: ExportFormProps) {
  const { form, submit, failure } = useExportForm(props);
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <KindAndFormat form={form} isSuperadmin={props.isSuperadmin} />
        <PeriodFields form={form} />
        {props.isSuperadmin ? <RwFilter form={form} rwUnits={props.rwUnits} /> : null}
        <FormField
          control={form.control}
          name="purpose"
          label={text.fields.purpose}
          description={text.fields.purposeHint}
          required
          render={(field) => <Textarea {...field} rows={3} />}
        />
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {text.submit}
        </Button>
      </PostForm>
    </Form>
  );
}
