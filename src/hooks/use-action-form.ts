'use client';

import { useState } from 'react';
import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';

import { showFieldErrors } from '@/lib/utils/form-errors';
import type { ActionFailure, ActionResult } from '@/types/action-result';

export interface ActionFormOptions<
  TValues extends FieldValues,
  TOutput extends FieldValues,
  TData,
> {
  form: UseFormReturn<TValues, unknown, TOutput>;
  // A Server Action: it validates the values again itself, so it takes them as unknown.
  action: (values: unknown) => Promise<ActionResult<TData>>;
  // The fields whose server-side errors are shown under their inputs.
  fields: readonly FieldPath<TValues>[];
  onSuccess: (data: TData) => void;
  // After a refusal, for instance to fetch a new Turnstile token: the last one has been used.
  onFailure?: (error: ActionFailure['error']) => void;
}

// Submits a react-hook-form form to its Server Action: the action's message goes above the form and its field errors
// under the inputs (docs/StyleGuide.md §6.9).
export function useActionForm<TValues extends FieldValues, TOutput extends FieldValues, TData>({
  form,
  action,
  fields,
  onSuccess,
  onFailure,
}: ActionFormOptions<TValues, TOutput, TData>) {
  const [failure, setFailure] = useState<string | null>(null);
  const submit = form.handleSubmit(async (values) => {
    setFailure(null);
    const result = await action(values);
    if (result.ok) {
      onSuccess(result.data);
      return;
    }
    showFieldErrors(form.setError, fields, result.error.fieldErrors);
    setFailure(result.error.message);
    onFailure?.(result.error);
  });
  return { submit, failure };
}
