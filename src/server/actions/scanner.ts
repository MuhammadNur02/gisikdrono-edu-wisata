'use server';

import { z } from 'zod';

import { mapError, ok } from '@/lib/errors';
import { requireAal2 } from '@/server/auth/guards';
import { logScannerOpened } from '@/server/services/scanner-service';
import type { ActionResult } from '@/types/action-result';

const noInputSchema = z.object({}).strict();

// docs/PRD.md FR-SCAN, Task P4.4.05: ScannerView reports its opening once per mount. Staff at AAL2 only, as the RPC
// requires; nothing to revalidate, since an audit row changes no page.
export async function logScannerOpenedAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = noInputSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    await logScannerOpened();
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
