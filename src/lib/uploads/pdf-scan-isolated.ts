import 'server-only';

import { Worker } from 'worker_threads';

import { MAX_PDF_SCAN_SECONDS, PDF_SCAN_WORKER_HEAP_MB } from '@/config/uploads';
import type { PdfScanResult, PublishedPageCount } from '@/lib/uploads/pdf-scan';
import type { ScanJob } from '@/lib/uploads/pdf-scan-worker';

// Every booklet scan runs in a worker thread of its own (Task P2.9.09, docs/Security.md R21 and §8.4, UPL-05).
// pdf-lib keeps each reference and name it creates in pools that live as long as their thread, so a scan in the
// server process left memory behind that was never freed; in a thread created for one scan the pools end with it.
// The runtime caps the thread's heap, and the thread is terminated once MAX_PDF_SCAN_SECONDS have passed, on top of
// the scan's own deadline. A thread that runs out of memory, throws, exits or is terminated answers pdf_too_complex.

const MS_PER_SECOND = 1000;
const WORKER_LIMIT_DETAIL = 'limit:worker';

type ScanOptions = {
  // Tests only: a shorter deadline, and other Node options for the thread.
  timeoutMs?: number;
  execArgv?: string[];
};

// A Next.js build compiles the worker into a JavaScript chunk of its own, which webpack does only for a Worker
// imported from 'worker_threads' (not 'node:worker_threads') with its `new URL(...)` written inside the call. The
// thread inherits the server process's Node options; under Vitest those load tsx (vitest.config.ts), so the worker's
// TypeScript sources and `@/` imports resolve there too.
function runInWorker(job: ScanJob, options: ScanOptions): Promise<unknown> {
  const worker = new Worker(new URL('./pdf-scan-worker.ts', import.meta.url), {
    resourceLimits: { maxOldGenerationSizeMb: PDF_SCAN_WORKER_HEAP_MB },
    ...(options.execArgv ? { execArgv: options.execArgv } : {}),
  });
  return new Promise<unknown>((resolve) => {
    const settle = (answer: unknown) => {
      clearTimeout(timer);
      resolve(answer);
      void worker.terminate();
    };
    const timer = setTimeout(
      () => {
        settle(null);
      },
      options.timeoutMs ?? MAX_PDF_SCAN_SECONDS * MS_PER_SECOND,
    );
    worker.once('message', settle);
    worker.once('error', () => {
      settle(null);
    });
    worker.once('exit', () => {
      settle(null);
    });
    worker.postMessage(job);
  });
}

// The worker posts only the scan's own result, so a message that has `ok` is that result; anything else (null) means
// the thread ended first.
function isScanResult(value: unknown): value is PdfScanResult {
  return typeof value === 'object' && value !== null && 'ok' in value;
}

function isPageCount(value: unknown): value is PublishedPageCount {
  return typeof value === 'object' && value !== null && 'ok' in value;
}

export async function scanBookletPdfIsolated(
  bytes: Uint8Array,
  options: ScanOptions = {},
): Promise<PdfScanResult> {
  const answer = await runInWorker({ kind: 'scan', bytes }, options);
  return isScanResult(answer)
    ? answer
    : { ok: false, problem: 'pdf_too_complex', detail: WORKER_LIMIT_DETAIL };
}

export async function countPublishedPagesIsolated(
  bytes: Uint8Array,
  options: ScanOptions = {},
): Promise<PublishedPageCount> {
  const answer = await runInWorker({ kind: 'count', bytes }, options);
  return isPageCount(answer) ? answer : { ok: false, problem: 'pdf_too_complex' };
}
