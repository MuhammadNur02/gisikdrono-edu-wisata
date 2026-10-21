import 'server-only';

import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';

const UNIQUE_VIOLATION = '23505';

interface PostgresErrorLike {
  code?: string;
}

// A slug is unique in its table; the officer gets to choose another rather than a generic conflict message.
export function slugConflictOr<E extends Error & PostgresErrorLike>(error: E): E | AppError {
  if (error.code === UNIQUE_VIOLATION && error.message.includes('slug')) {
    return new AppError('CONFLICT', copy.cms.validation.slugTaken);
  }
  return error;
}

// An update or delete that RLS, or the RW the query names, let touch no row: for this staff member the row is not
// there.
export function rowOrNotFound<Row>(row: Row | null): Row {
  if (row === null) throw new AppError('NOT_FOUND');
  return row;
}
