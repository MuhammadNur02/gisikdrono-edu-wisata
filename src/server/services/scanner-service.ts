import 'server-only';

import { rpcLogUiEvent } from '@/db/rpc';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// /dashboard/scanner (Task P4.4.05): the opening of the gate scanner is audited through rpc_log_ui_event, under the
// officer's own session, so auth.uid() names who opened it and the RPC's own AAL2 check and hourly cap apply.
export async function logScannerOpened(): Promise<void> {
  await rpcLogUiEvent(await createSupabaseServerClient(), {
    event: 'scanner_opened',
    entityId: null,
  });
}
