import { afterEach, describe, expect, it, vi } from 'vitest';

import { countPublishedPages, scanBookletPdf } from './pdf-scan';
import { handWrittenPdf, packedStreamObject } from '../../../tests/fixtures/pdf';

// Security review of PR #14, N3: the parsed-object count and the deadline of a scan. The count is checked here
// against a limit of 20,000 so each case parses in milliseconds; pdf-load-guard.test.ts checks the real limit once.

// Hoisted with the mock below, which runs before anything else in this file.
const { TEST_OBJECT_LIMIT } = vi.hoisted(() => ({ TEST_OBJECT_LIMIT: 20_000 }));

vi.mock('@/config/uploads', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  MAX_PDF_PARSED_OBJECTS: TEST_OBJECT_LIMIT,
}));

// One object stream holding a single array of `numbers` zeros.
function packedArrayPdf(numbers: number): Buffer {
  const content = `6 0 [${'0 '.repeat(numbers)}]`;
  return handWrittenPdf('', [
    packedStreamObject(4, '/Type /ObjStm /N 1 /First 4', content.length, content),
  ]);
}

// The scan reads the clock once to set its deadline; every later reading is long past it.
function clockPastTheDeadline() {
  vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(Number.MAX_SAFE_INTEGER);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scanBookletPdf: parsed objects', () => {
  it('refuses a small file that unpacks into more objects than the limit', async () => {
    await expect(scanBookletPdf(packedArrayPdf(TEST_OBJECT_LIMIT + 1))).resolves.toEqual({
      ok: false,
      problem: 'pdf_too_complex',
      detail: 'limit:too_many_objects',
    });
  });

  it('counts objects written plainly in the file, not only packed ones', async () => {
    const plainArray = `4 0 obj\n[${'0 '.repeat(TEST_OBJECT_LIMIT + 1)}]\nendobj\n`;

    await expect(scanBookletPdf(handWrittenPdf('', [plainArray]))).resolves.toMatchObject({
      problem: 'pdf_too_complex',
      detail: 'limit:too_many_objects',
    });
  });

  it('still publishes a file just under the limit', async () => {
    await expect(scanBookletPdf(packedArrayPdf(TEST_OBJECT_LIMIT - 100))).resolves.toMatchObject({
      ok: true,
      pageCount: 1,
    });
  });

  it('holds api/uploads/sign-pages to the same limits when it reads a published booklet back', async () => {
    await expect(countPublishedPages(packedArrayPdf(TEST_OBJECT_LIMIT + 1))).resolves.toEqual({
      ok: false,
      problem: 'pdf_too_complex',
    });
  });
});

describe('scanBookletPdf: the deadline', () => {
  it('stops a load that runs past it', async () => {
    clockPastTheDeadline();

    await expect(scanBookletPdf(packedArrayPdf(10_000))).resolves.toEqual({
      ok: false,
      problem: 'pdf_too_complex',
      detail: 'limit:too_slow',
    });
  });

  it('stops the steps after the load too', async () => {
    clockPastTheDeadline();

    // Too few objects for the parser to look at the clock, so the check after loading is the one that stops it.
    await expect(scanBookletPdf(handWrittenPdf())).resolves.toEqual({
      ok: false,
      problem: 'pdf_too_complex',
      detail: 'limit:too_slow',
    });
  });
});
