// What a failed call to Supabase says about itself, read from the error PostgREST or supabase-js handed back. The scan
// route answers 503 for an outage that a retry may get past and keeps 500 for everything else (review of PR #54, L3).

// Postgres classes 08 (connection), 53 (insufficient resources) and 57 (operator intervention, a statement timeout
// included); serialization and deadlock failures and a lock not available; PostgREST unable to reach or use its pool.
const TRANSIENT_CLASSES = new Set(['08', '53', '57']);
const TRANSIENT_CODES = new Set([
  '40001',
  '40P01',
  '55P03',
  'PGRST000',
  'PGRST001',
  'PGRST002',
  'PGRST003',
]);
const SQLSTATE_LENGTH = 5;
const SQLSTATE_CLASS_LENGTH = 2;
// supabase-js reports a fetch that never reached PostgREST with an empty code and the fetch error's message.
const NETWORK_FAILURE = /fetch failed|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up/i;

export function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error)
    return String(error.message);
  return '';
}

export function isTransientDatabaseError(error: unknown): boolean {
  const code = databaseErrorCode(error);
  if (code !== undefined && TRANSIENT_CODES.has(code)) return true;
  if (
    code?.length === SQLSTATE_LENGTH &&
    TRANSIENT_CLASSES.has(code.slice(0, SQLSTATE_CLASS_LENGTH))
  )
    return true;
  return (code === undefined || code === '') && NETWORK_FAILURE.test(messageOf(error));
}
