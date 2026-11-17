import 'server-only';

import { postgresCodeOf } from '@/lib/errors';
import { createLogger } from '@/lib/logger';

// A KPI that failed to load becomes null, logged by name and by the PostgREST or SQLSTATE code when there is one, so
// one bad read never takes the overview down.
export function figureOf<T>(result: PromiseSettledResult<T | null>, kpi: string): T | null {
  if (result.status === 'fulfilled') return result.value;
  const reason: unknown = result.reason;
  createLogger(crypto.randomUUID()).error('internal_error', {
    kpi,
    errorName: reason instanceof Error ? reason.name : typeof reason,
    code: postgresCodeOf(reason),
  });
  return null;
}
