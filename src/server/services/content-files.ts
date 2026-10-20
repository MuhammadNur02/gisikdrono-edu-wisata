import 'server-only';

import { createLogger } from '@/lib/logger';

// A removed row's files go after the row itself, so the public site never shows a missing photo. Files that could
// not be removed are logged, by the row's id only, and left for a later clean-up rather than putting the row back.
export async function removeFilesOrLog(
  source: string,
  rowId: string,
  removal: () => Promise<unknown>,
): Promise<void> {
  try {
    await removal();
  } catch (filesError) {
    createLogger(crypto.randomUUID()).error('internal_error', {
      source,
      rowId,
      errorName: filesError instanceof Error ? filesError.name : typeof filesError,
    });
  }
}
