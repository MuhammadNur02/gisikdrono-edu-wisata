import { MAX_CONCURRENT_PDF_SCANS } from '@/config/uploads';

// How many booklet scans one server process runs at once (security review of PR #14, F2). A scan can hold a
// hundred megabytes and seconds of CPU, and a staff member could otherwise start as many as their requests allow;
// past the limit a scan is turned away at once, before it reads anything, rather than queued. Isolating each scan in
// a worker thread (Task P2.9.09) replaces this count with real limits on memory and time.

let runningScans = 0;

export type ScanSlotResult<T> = { ok: true; value: T } | { ok: false; reason: 'busy' };

export async function withScanSlot<T>(scan: () => Promise<T>): Promise<ScanSlotResult<T>> {
  if (runningScans >= MAX_CONCURRENT_PDF_SCANS) return { ok: false, reason: 'busy' };
  runningScans += 1;
  try {
    return { ok: true, value: await scan() };
  } finally {
    runningScans -= 1;
  }
}
