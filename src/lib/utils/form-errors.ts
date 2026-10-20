import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';

// Puts the field errors a Server Action returned under their inputs (docs/StyleGuide.md §6.9). Only the fields the
// form names are looked up, so an unexpected key from the server is simply not shown.
export function showFieldErrors<TValues extends FieldValues>(
  setError: UseFormSetError<TValues>,
  fields: readonly FieldPath<TValues>[],
  fieldErrors: Record<string, string[]> | undefined,
): void {
  for (const field of fields) {
    const [message] = fieldErrors?.[field] ?? [];
    if (message) setError(field, { type: 'server', message });
  }
}
