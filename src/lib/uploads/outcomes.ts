import 'server-only';

import type { EnumValue } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { fail } from '@/lib/errors';
import type { ActionFailure } from '@/types/action-result';
import type { UploadProblem } from '@/types/upload';

// How a refused upload is answered and recorded (docs/Security.md §8.4, §11.1).

// 'forbidden': a signed-in staff member asked for another RW's prefix, or without a TOTP check.
export type UploadRefusalReason = UploadProblem | 'forbidden';

// A refusal that only a hand-made request or a doctored file produces; the rest are honest mistakes.
const SUSPICIOUS_PROBLEMS: ReadonlySet<UploadRefusalReason> = new Set([
  'svg',
  'pdf_active_content',
  'pdf_link',
]);

const NOT_FOUND_PROBLEMS: ReadonlySet<UploadProblem> = new Set(['missing', 'booklet_missing']);
// A booklet whose pages are taken. A page finalize finds published answers CONFLICT through AppError instead, and
// already_used stays a validation refusal so the browser never mistakes it for a page that is done.
const CONFLICT_PROBLEMS: ReadonlySet<UploadProblem> = new Set([
  'booklet_pages_exist',
  'booklet_pages_in_progress',
]);

export function refusalSeverity(reason: UploadRefusalReason): EnumValue<'alert_severity'> {
  if (reason === 'forbidden') return 'high';
  return SUSPICIOUS_PROBLEMS.has(reason) ? 'medium' : 'info';
}

// What the uploader shows: the problem's own Indonesian message.
export function failureFor(problem: UploadProblem): ActionFailure {
  const code = NOT_FOUND_PROBLEMS.has(problem)
    ? 'NOT_FOUND'
    : CONFLICT_PROBLEMS.has(problem)
      ? 'CONFLICT'
      : 'VALIDATION';
  return fail(code, undefined, copy.uploads.problems[problem]);
}
