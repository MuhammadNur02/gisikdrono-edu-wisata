import { toNestErrors } from '@hookform/resolvers';
import type { FieldError, FieldValues, Resolver } from 'react-hook-form';
import type { z } from 'zod';

// A react-hook-form resolver for a form whose fields hold what the visitor has done so far (a select not chosen yet,
// a box not ticked) while the schema says what may be sent. prepare shapes the values for the schema first, such as
// leaving out the participant rows nobody filled in. The first message of each field is the one shown.
export function schemaResolver<TValues extends FieldValues, TOutput extends FieldValues>(
  schema: z.ZodType<TOutput>,
  prepare: (values: TValues) => unknown = (values) => values,
): Resolver<TValues, unknown, TOutput> {
  return (values, _context, options) => {
    const parsed = schema.safeParse(prepare(values));
    if (parsed.success) return { values: parsed.data, errors: {} };
    const errors: Record<string, FieldError> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      errors[path] ??= { type: issue.code, message: issue.message };
    }
    return { values: {}, errors: toNestErrors(errors, options) };
  };
}
