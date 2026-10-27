'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { STATEMENT_MAX_FILE_BYTES, STATEMENT_RECORDS_SHOWN } from '@/config/midtrans-statement';
import { useActionForm } from '@/hooks/use-action-form';
import { statementCopy as text } from '@/lib/copy/midtrans-statement';
import { staffCopy } from '@/lib/copy/staff';
import { parseMidtransStatement, type StatementParse } from '@/lib/midtrans/statement-csv';
import { withStepUp } from '@/lib/utils/step-up';
import {
  importStatementFormSchema,
  type ImportStatementFormValues,
} from '@/lib/validations/midtrans-statement';
import type { ActionResult } from '@/types/action-result';
import type { StatementImportSummary } from '@/types/midtrans-statement';

type StatementForm = UseFormReturn<ImportStatementFormValues>;

export interface StatementImportFormProps {
  importAction: (values: unknown) => Promise<ActionResult<StatementImportSummary>>;
  stepUpAction: (values: unknown) => Promise<ActionResult<null>>;
}

// What is wrong with a statement, with the first record numbers it is in, as a spreadsheet numbers them.
function problemMessage(parse: Extract<StatementParse, { ok: false }>): string {
  const shown = parse.records.slice(0, STATEMENT_RECORDS_SHOWN);
  const message = text.problems[parse.problem];
  return shown.length > 0
    ? `${message} ${text.records(shown, parse.records.length - shown.length)}`
    : message;
}

// The browser reads the file and keeps only its rows; the action and the database check them again.
async function chooseStatement(form: StatementForm, file: File): Promise<void> {
  form.setValue('fileName', file.name);
  form.setValue('rows', []);
  if (file.size > STATEMENT_MAX_FILE_BYTES) {
    form.setError('rows', { message: text.fileTooLarge });
    return;
  }
  const parse = parseMidtransStatement(await file.text());
  if (!parse.ok) {
    form.setError('rows', { message: problemMessage(parse) });
    return;
  }
  form.clearErrors('rows');
  form.setValue('rows', parse.rows);
}

function StatementFileField({ form }: { form: StatementForm }) {
  const count = form.watch('rows').length;
  return (
    <FormField
      control={form.control}
      name="rows"
      label={text.file}
      description={count > 0 ? text.ready(count) : text.fileHint}
      required
      render={(field) => (
        <Input
          type="file"
          accept=".csv,text/csv"
          name={field.name}
          ref={field.ref}
          onBlur={field.onBlur}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void chooseStatement(form, file);
          }}
        />
      )}
    />
  );
}

function useStatementImportForm({ importAction, stepUpAction }: StatementImportFormProps) {
  const router = useRouter();
  const [summary, setSummary] = useState<StatementImportSummary | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const form = useForm({
    resolver: zodResolver(importStatementFormSchema),
    defaultValues: { fileName: '', rows: [], code: '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action: withStepUp(stepUpAction, importAction),
    fields: ['rows', 'code'],
    onSuccess: (data: StatementImportSummary) => {
      setSummary(data);
      form.reset();
      setInputKey((key) => key + 1);
      router.refresh();
    },
  });
  return { form, submit, failure, summary, inputKey };
}

// Task P4.7.05 (docs/Security.md REC-02): the superadmin uploads the Midtrans dashboard's transaction CSV and confirms
// with the authenticator code (§5.3); the differences become reconciliation issues of their own run.
export function StatementImportForm(props: StatementImportFormProps) {
  const { form, submit, failure, summary, inputKey } = useStatementImportForm(props);
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        {summary ? (
          <FormAlert tone="info">{text.done(summary.rowsChecked, summary.issuesFound)}</FormAlert>
        ) : null}
        <StatementFileField key={inputKey} form={form} />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {text.submit}
        </Button>
      </PostForm>
    </Form>
  );
}
