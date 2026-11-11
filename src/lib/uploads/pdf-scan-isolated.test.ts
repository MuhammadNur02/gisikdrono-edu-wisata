import { describe, expect, it, vi } from 'vitest';

import { countPublishedPagesIsolated, scanBookletPdfIsolated } from './pdf-scan-isolated';
import { cleanBookletPdf, handWrittenPdf, pdfObject } from '../../../tests/fixtures/pdf';
import { HEAVY_FILE_TEST_TIMEOUT_MS } from '../../../tests/fixtures/timeouts';

vi.setConfig({ testTimeout: HEAVY_FILE_TEST_TIMEOUT_MS });

const MILLION = 1_000_000;
const BYTES_PER_MB = 1024 * 1024;
// In the server process a million names stayed at about 105 MB after the scan (docs/Security.md §8.4, R21).
const HEAP_LEFT_BEHIND_LIMIT_MB = 25;

// A booklet whose catalog points at an array of a million different names.
function pdfWithAMillionNames(): Buffer {
  const names = Array.from({ length: MILLION }, (_, index) => `/N${String(index)}`).join(' ');
  return handWrittenPdf('/Extra 4 0 R', [pdfObject(4, `[${names}]`)]);
}

function heapUsedMb(): number {
  globalThis.gc?.();
  return process.memoryUsage().heapUsed / BYTES_PER_MB;
}

describe('scanBookletPdfIsolated', () => {
  it('answers with the scan of the worker thread', async () => {
    const result = await scanBookletPdfIsolated(await cleanBookletPdf());

    expect(result).toMatchObject({ ok: true, pageCount: 2 });
  });

  it('leaves the server process heap as it was after a million distinct names', async () => {
    const pdf = pdfWithAMillionNames();
    const before = heapUsedMb();

    await scanBookletPdfIsolated(pdf);

    expect(heapUsedMb() - before).toBeLessThan(HEAP_LEFT_BEHIND_LIMIT_MB);
  });

  it('terminates a scan past its deadline and refuses the file as too complex', async () => {
    const result = await scanBookletPdfIsolated(await cleanBookletPdf(), { timeoutMs: 1 });

    expect(result).toEqual({ ok: false, problem: 'pdf_too_complex', detail: 'limit:worker' });
  });

  it('refuses a file when the worker cannot start at all', async () => {
    const result = await scanBookletPdfIsolated(await cleanBookletPdf(), {
      execArgv: ['--import', 'a-loader-that-does-not-exist'],
    });

    expect(result).toMatchObject({ ok: false, problem: 'pdf_too_complex' });
  });
});

describe('countPublishedPagesIsolated', () => {
  it('counts the pages of a published booklet in the worker thread', async () => {
    await expect(countPublishedPagesIsolated(await cleanBookletPdf())).resolves.toEqual({
      ok: true,
      pageCount: 2,
    });
  });

  it('answers too complex when the worker is terminated first', async () => {
    await expect(
      countPublishedPagesIsolated(await cleanBookletPdf(), { timeoutMs: 1 }),
    ).resolves.toEqual({ ok: false, problem: 'pdf_too_complex' });
  });
});
