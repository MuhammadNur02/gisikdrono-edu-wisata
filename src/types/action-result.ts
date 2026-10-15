export type ActionErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'QUOTA_EXCEEDED'
  | 'STATE_INVALID'
  | 'PRICE_MISMATCH'
  | 'RATE_LIMITED'
  | 'PAYMENT'
  | 'INTERNAL';

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: ActionErrorCode; message: string; fieldErrors?: Record<string, string[]> };
    };

export type ActionFailure = Extract<ActionResult<never>, { ok: false }>;
