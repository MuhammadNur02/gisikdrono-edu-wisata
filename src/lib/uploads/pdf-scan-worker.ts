import { parentPort } from 'node:worker_threads';

import { countPublishedPages, scanBookletPdf } from './pdf-scan';

// The thread one booklet scan runs in (Task P2.9.09, docs/Security.md R21). It reads one job, answers once and is
// then terminated by ./pdf-scan-isolated.ts, so the pools pdf-lib fills with references and names end with it. It
// gets the bytes and returns the scan's answer, nothing else.

export type ScanJob = { kind: 'scan' | 'count'; bytes: Uint8Array };

parentPort?.once('message', (job: ScanJob) => {
  void answer(job);
});

// The answer is copied back rather than transferred: a booklet is a few megabytes, and a copy leaves nothing of the
// thread's memory in the server process.
async function answer(job: ScanJob): Promise<void> {
  const result =
    job.kind === 'count' ? await countPublishedPages(job.bytes) : await scanBookletPdf(job.bytes);
  parentPort?.postMessage(result);
}
