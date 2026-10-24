import 'server-only';

import { contentListsCopy } from '@/lib/copy/content-lists';
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

// A permanent removal filters on the archived state (Task P4.3.03, review of PR #40): a row the action found but the
// delete did not touch is still live, so the officer is told to archive it first rather than that it is gone.
export function archivedRowOr<Row>(
  row: Row | null,
  message: string = contentListsCopy.actions.notArchived,
): Row {
  if (row === null) throw new AppError('STATE_INVALID', message);
  return row;
}

// An update or delete that RLS, or the RW the query names, let touch no row: for this staff member the row is not
// there.
export function rowOrNotFound<Row>(row: Row | null): Row {
  if (row === null) throw new AppError('NOT_FOUND');
  return row;
}
