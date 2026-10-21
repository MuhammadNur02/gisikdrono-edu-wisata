import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_PDF_INFLATED_BYTES,
  MAX_PDF_NAME_BYTES,
  MAX_PDF_OBJECT_NUMBER,
  MAX_PDF_PARSED_OBJECTS,
} from '@/config/uploads';

import { scanBookletPdf } from './pdf-scan';
import {
  handWrittenPdf,
  packedStreamObject,
  pdfFromObjects,
  pdfObject,
  pdfWithPackedStream,
} from '../../../tests/fixtures/pdf';
import { HEAVY_FILE_TEST_TIMEOUT_MS } from '../../../tests/fixtures/timeouts';

vi.setConfig({ testTimeout: HEAVY_FILE_TEST_TIMEOUT_MS });

// Security review of PR #14, L2 and N3: pdf-lib inflates object and cross-reference streams while it loads and turns
// every object it parses into a JavaScript object, so the scan caps what the streams of a document may unpack to
// (one budget for all of them), how many objects may be parsed, and how long the scan may take.

const MEGABYTE = 1024 * 1024;
const OVER_THE_LIMIT = MAX_PDF_INFLATED_BYTES + MEGABYTE;

describe('scanBookletPdf: packed streams', () => {
  it('refuses an object stream that inflates past the limit, from a file of a few kilobytes', async () => {
    const bomb = pdfWithPackedStream('/Type /ObjStm /N 1 /First 4', OVER_THE_LIMIT);
    expect(bomb.length).toBeLessThan(MEGABYTE);

    await expect(scanBookletPdf(bomb)).resolves.toEqual({
      ok: false,
      problem: 'pdf_too_complex',
      detail: 'limit:too_large',
    });
  });

  it('refuses a cross-reference stream that inflates past the limit', async () => {
    const bomb = pdfWithPackedStream('/Type /XRef /Size 5 /W [1 2 1]', OVER_THE_LIMIT);

    await expect(scanBookletPdf(bomb)).resolves.toEqual({
      ok: false,
      problem: 'pdf_too_complex',
      detail: 'limit:too_large',
    });
  });

  it('counts every packed stream of a file against one budget', async () => {
    // Two object streams pdf-lib can read, each under the limit on its own.
    const half = Math.ceil(OVER_THE_LIMIT / 2);
    const pdf = handWrittenPdf('', [
      packedStreamObject(4, '/Type /ObjStm /N 1 /First 4', half, '6 0 null'),
      packedStreamObject(5, '/Type /ObjStm /N 1 /First 4', half, '7 0 null'),
    ]);

    await expect(scanBookletPdf(pdf)).resolves.toEqual({
      ok: false,
      problem: 'pdf_too_complex',
      detail: 'limit:too_large',
    });
  });

  it.each([
    ['a chain of two filters', '/Filter [/FlateDecode /FlateDecode]'],
    ['a filter zlib does not speak', '/Filter /LZWDecode'],
  ])('refuses an object stream packed with %s', async (_case, filter) => {
    const pdf = handWrittenPdf('', [
      pdfObject(
        4,
        `<< /Type /ObjStm /N 1 /First 4 ${filter} /Length 4 >>\nstream\nxxxx\nendstream`,
      ),
    ]);

    await expect(scanBookletPdf(pdf)).resolves.toEqual({
      ok: false,
      problem: 'unreadable',
      detail: 'packed:unsupported_filter',
    });
  });

  it('refuses an object stream zlib cannot read', async () => {
    const pdf = handWrittenPdf('', [
      pdfObject(
        4,
        '<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length 4 >>\nstream\nxxxx\nendstream',
      ),
    ]);

    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({ ok: false, problem: 'unreadable' });
  });

  it('still publishes a booklet a writer packed into object streams', async () => {
    const document = await PDFDocument.create();
    document.addPage([420, 595]);
    document.addPage([420, 595]);

    const result = await scanBookletPdf(await document.save({ useObjectStreams: true }));

    expect(result).toMatchObject({ ok: true, pageCount: 2 });
  });

  it('leaves pdf-lib unguarded outside a scan', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    const packed = await document.save({ useObjectStreams: true });

    await expect(PDFDocument.load(packed)).resolves.toBeInstanceOf(PDFDocument);
  });
});

// One object stream holding a single array of `numbers` zeros: a file of kilobytes, an array of millions of objects.
function packedArrayPdf(numbers: number): Buffer {
  const content = `6 0 [${'0 '.repeat(numbers)}]`;
  return handWrittenPdf('', [
    packedStreamObject(4, '/Type /ObjStm /N 1 /First 4', content.length, content),
  ]);
}

// Parsing two million objects takes seconds, more under coverage; pdf-load-limits.test.ts covers the same rules
// quickly with a smaller limit.
const REAL_LIMIT_TIMEOUT_MS = 60_000;

describe('scanBookletPdf: parsed objects at the real limit', () => {
  // Coverage slows this parse to near the scan's 20 seconds, and the deadline has tests of its own: the clock stands
  // still here so this test is about the object count alone.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(
    'refuses a few kilobytes that unpack into more objects than the limit',
    async () => {
      const pdf = packedArrayPdf(MAX_PDF_PARSED_OBJECTS + 1);
      expect(pdf.length).toBeLessThan(64 * 1024);

      await expect(scanBookletPdf(pdf)).resolves.toEqual({
        ok: false,
        problem: 'pdf_too_complex',
        detail: 'limit:too_many_objects',
      });
    },
    REAL_LIMIT_TIMEOUT_MS,
  );
});

// Follow-up of N3 (docs/Security.md R21): pdf-lib keeps every reference it creates for as long as the process lives,
// so an object number above the bound, or a generation above the format's maximum, is refused before the object it
// names is parsed, wherever pdf-lib meets it.
const TOO_HIGH = MAX_PDF_OBJECT_NUMBER + 1;
const OBJECT_NUMBER_REFUSAL = {
  ok: false,
  problem: 'pdf_too_complex',
  detail: 'limit:object_number_too_high',
};

// The one-page booklet of handWrittenPdf with a classic cross-reference table whose last subsection is `subsection`.
function pdfWithXrefSubsection(subsection: string): Buffer {
  const text = handWrittenPdf().toString('latin1');
  return Buffer.from(text.replace('trailer\n', `${subsection}trailer\n`), 'latin1');
}

describe('scanBookletPdf: object numbers', () => {
  it('refuses an indirect object numbered above the bound', async () => {
    const pdf = handWrittenPdf('', [pdfObject(TOO_HIGH, '<< /Catatan (di luar batas) >>')]);

    await expect(scanBookletPdf(pdf)).resolves.toEqual(OBJECT_NUMBER_REFUSAL);
  });

  it('refuses a classic cross-reference table that lists an object above the bound', async () => {
    const pdf = pdfWithXrefSubsection(`${String(TOO_HIGH)} 1\n0000000000 00000 n \n`);

    await expect(scanBookletPdf(pdf)).resolves.toEqual(OBJECT_NUMBER_REFUSAL);
  });

  it('refuses a cross-reference stream that lists an object above the bound', async () => {
    const entry = String.fromCharCode(1, 0, 0);
    const xrefStream = pdfObject(
      4,
      `<< /Type /XRef /W [1 1 1] /Index [${String(TOO_HIGH)} 1] /Size ${String(TOO_HIGH + 1)} /Length 3 >>\nstream\n${entry}\nendstream`,
    );

    await expect(scanBookletPdf(handWrittenPdf('', [xrefStream]))).resolves.toEqual(
      OBJECT_NUMBER_REFUSAL,
    );
  });

  it('refuses a reference to an object above the bound', async () => {
    const pdf = handWrittenPdf(`/Extra [${String(TOO_HIGH)} 0 R]`);

    await expect(scanBookletPdf(pdf)).resolves.toEqual(OBJECT_NUMBER_REFUSAL);
  });

  it('refuses a generation number above the largest the format allows', async () => {
    await expect(scanBookletPdf(handWrittenPdf('/Extra [1 65536 R]'))).resolves.toEqual(
      OBJECT_NUMBER_REFUSAL,
    );
  });

  it('accepts an object at the bound and the usual 65535 generation of the free-list head', async () => {
    const pdf = pdfFromObjects([
      pdfObject(
        1,
        `<< /Type /Catalog /Pages 2 0 R /Extra [${String(MAX_PDF_OBJECT_NUMBER)} 0 R] >>`,
      ),
      pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
      pdfObject(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] >>'),
    ]);
    expect(pdf.toString('latin1')).toContain('0000000000 65535 f');

    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({ ok: true, pageCount: 1 });
  });
});

// Security review of PR #14, F1: a name longer than the format allows is refused while pdf-lib parses it, before any
// decoding of its escapes can cost anything.
const NAME_REFUSAL = { ok: false, problem: 'pdf_too_complex', detail: 'limit:name_too_long' };

describe('scanBookletPdf: name lengths', () => {
  it('accepts a name of the largest length the format allows', async () => {
    const pdf = handWrittenPdf(`/Extra /${'A'.repeat(MAX_PDF_NAME_BYTES)}`);

    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({ ok: true });
  });

  it('refuses a name one byte longer', async () => {
    const pdf = handWrittenPdf(`/Extra /${'A'.repeat(MAX_PDF_NAME_BYTES + 1)}`);

    await expect(scanBookletPdf(pdf)).resolves.toEqual(NAME_REFUSAL);
  });

  it('counts an escape as the one byte it stands for', async () => {
    const written = `${'A'.repeat(MAX_PDF_NAME_BYTES - 27)}${'#41'.repeat(27)}`;

    await expect(scanBookletPdf(handWrittenPdf(`/Extra /${written}`))).resolves.toMatchObject({
      ok: true,
    });
  });

  it('refuses a name of nested escapes at once, whatever its depth', async () => {
    const nested = `/#23${'23'.repeat(20_000)}41`;
    const startedAt = performance.now();

    await expect(scanBookletPdf(handWrittenPdf(`/Extra ${nested}`))).resolves.toEqual(NAME_REFUSAL);
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });
});
