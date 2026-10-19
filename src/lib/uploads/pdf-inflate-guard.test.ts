import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { MAX_PDF_INFLATED_BYTES } from '@/config/uploads';

import { scanBookletPdf } from './pdf-scan';
import {
  handWrittenPdf,
  packedStreamObject,
  pdfObject,
  pdfWithPackedStream,
} from '../../../tests/fixtures/pdf';

// Security review of PR #14, L2: pdf-lib inflates object and cross-reference streams while it loads, so the scan
// caps what they may unpack to before pdf-lib sees them.

const MEGABYTE = 1024 * 1024;
const OVER_THE_LIMIT = MAX_PDF_INFLATED_BYTES + MEGABYTE;

describe('scanBookletPdf: packed streams', () => {
  it('refuses an object stream that inflates past the limit, from a file of a few kilobytes', async () => {
    const bomb = pdfWithPackedStream('/Type /ObjStm /N 1 /First 4', OVER_THE_LIMIT);
    expect(bomb.length).toBeLessThan(MEGABYTE);

    await expect(scanBookletPdf(bomb)).resolves.toEqual({
      ok: false,
      problem: 'unreadable',
      detail: 'packed:too_large',
    });
  });

  it('refuses a cross-reference stream that inflates past the limit', async () => {
    const bomb = pdfWithPackedStream('/Type /XRef /Size 5 /W [1 2 1]', OVER_THE_LIMIT);

    await expect(scanBookletPdf(bomb)).resolves.toEqual({
      ok: false,
      problem: 'unreadable',
      detail: 'packed:too_large',
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
      problem: 'unreadable',
      detail: 'packed:too_large',
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
