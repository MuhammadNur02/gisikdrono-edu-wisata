import { PDFDocument, PDFName } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withLoadLimits } from './pdf-load-guard';
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

// A booklet as finalize publishes it: written by pdf-lib with object streams and a cross-reference stream, so it has
// no classic trailer, with one array of `numbers` zeros on the catalog.
async function pdfLibWrittenBooklet(numbers: number): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([420, 595]);
  const zeros = document.context.obj(Array.from({ length: numbers }, () => 0));
  document.catalog.set(PDFName.of('Extra'), document.context.register(zeros));
  return document.save({ useObjectStreams: true });
}

// handWrittenPdf's booklet whose classic cross-reference table lists `entries` more objects, numbered from 4.
function pdfWithXrefEntries(entries: number): Buffer {
  const rows = '0000000000 00000 n \n'.repeat(entries);
  const text = handWrittenPdf().toString('latin1');
  return Buffer.from(text.replace('trailer\n', `4 ${String(entries)}\n${rows}trailer\n`), 'latin1');
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

  // Follow-up of N3: a classic cross-reference table's entries become references without a single parseObject call.
  it('counts the entries of a classic cross-reference table', async () => {
    await expect(scanBookletPdf(pdfWithXrefEntries(TEST_OBJECT_LIMIT + 1))).resolves.toEqual({
      ok: false,
      problem: 'pdf_too_complex',
      detail: 'limit:too_many_objects',
    });
  });
});

// Security review of PR #14, Info B: loading without throwOnInvalidObject, pdf-lib swallows the guard's error and
// carries on, and a file pdf-lib wrote has no classic trailer whose parsing would throw again.
describe('api/uploads/sign-pages reading a published booklet back', () => {
  it('works on a file with a cross-reference stream and no classic trailer', async () => {
    const pdf = await pdfLibWrittenBooklet(TEST_OBJECT_LIMIT + 1);

    expect(Buffer.from(pdf).toString('latin1')).not.toContain('trailer');
  });

  it('holds such a file to the same limits', async () => {
    const pdf = await pdfLibWrittenBooklet(TEST_OBJECT_LIMIT + 1);

    await expect(countPublishedPages(pdf)).resolves.toEqual({
      ok: false,
      problem: 'pdf_too_complex',
    });
  });

  it('still counts the pages of one within the limits', async () => {
    const pdf = await pdfLibWrittenBooklet(100);

    await expect(countPublishedPages(pdf)).resolves.toEqual({ ok: true, pageCount: 1 });
  });

  it('reports a refusal even when the load swallowed the error and finished', async () => {
    const pdf = await pdfLibWrittenBooklet(TEST_OBJECT_LIMIT + 1);
    // Whatever pdf-lib does with the guard's error, a load that hides it and resolves must not count as passed.
    const swallowingLoad = async () => {
      await PDFDocument.load(pdf, { updateMetadata: false }).catch(() => undefined);
      return 'finished';
    };

    await expect(withLoadLimits(swallowingLoad, Number.POSITIVE_INFINITY)).resolves.toEqual({
      ok: false,
      refusal: 'too_many_objects',
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
