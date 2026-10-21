import 'server-only';

import { createLogger } from '@/lib/logger';

// A row's files go right after the row is written or removed, in the same action, so the public site never shows a
// missing photo and a photo taken off the site really leaves public-media (docs/Security.md R34). A removal that
// fails is logged by the row's id only and answered with false, so the action can tell the officer; the files stay
// for the orphan clean-up (Task P2.9.11) rather than putting the row back.
export async function removeFilesOrLog(
  source: string,
  rowId: string,
  removal: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await removal();
    return true;
  } catch (filesError) {
    createLogger(crypto.randomUUID()).error('internal_error', {
      source,
      rowId,
      errorName: filesError instanceof Error ? filesError.name : typeof filesError,
    });
    return false;
  }
}
