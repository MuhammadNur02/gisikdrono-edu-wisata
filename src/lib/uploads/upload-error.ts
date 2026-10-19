import type { ActionErrorCode } from '@/types/action-result';

// A refusal from api/uploads/{sign,sign-pages,finalize} that the uploader shows as it is: the server's own
// Indonesian message (copy.uploads.problems), such as how to save an iPhone photo as JPG. `code` is the route's
// ActionErrorCode, or undefined when the answer was not one the routes send (a proxy error page, a lost reply).
export class UploadRejectedError extends Error {
  readonly code: ActionErrorCode | undefined;

  constructor(message: string, code?: ActionErrorCode) {
    super(message);
    this.name = 'UploadRejectedError';
    this.code = code;
  }
}
