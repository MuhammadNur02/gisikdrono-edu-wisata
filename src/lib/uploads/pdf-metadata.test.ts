import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { scanBookletPdf } from './pdf-scan';
import { handWrittenPdf, pdfObject, pdfWithPageAnnotation } from '../../../tests/fixtures/pdf';

// Security review of PR #14, L4: the published copy leaves out comments, an application's private data, page
// thumbnails and every object nothing reaches.

const LINK =
  '<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /A << /S /URI /URI (https://x.test/) >> >>';

async function publishedCopy(pdf: Uint8Array) {
  const result = await scanBookletPdf(pdf);
  if (!result.ok) throw new Error(`the scan refused the fixture: ${result.problem}`);
  return { result, bytes: Buffer.from(result.pdf).toString('latin1') };
}

async function pageAnnotationTypes(pdf: Uint8Array): Promise<string[]> {
  const copy = await PDFDocument.load(pdf);
  const annots = copy.getPage(0).node.lookup(PDFName.of('Annots'));
  if (!(annots instanceof PDFArray)) return [];
  return annots.asArray().map((entry) => {
    const annotation = copy.context.lookup(entry);
    const subtype = annotation instanceof PDFDict ? annotation.get(PDFName.of('Subtype')) : null;
    return subtype instanceof PDFName ? subtype.decodeText() : 'unknown';
  });
}

describe('scanBookletPdf: comments', () => {
  it('leaves out a sticky note and its popup, keeps the link and says how many went', async () => {
    const pdf = handWrittenPdf(
      '',
      [
        pdfObject(4, LINK),
        pdfObject(
          5,
          '<< /Type /Annot /Subtype /Text /Rect [0 0 10 10] /T (Pak Budi) /Contents (catatan rahasia) /Popup 6 0 R >>',
        ),
        pdfObject(6, '<< /Type /Annot /Subtype /Popup /Rect [0 0 10 10] /Parent 5 0 R >>'),
      ],
      '',
      '/Annots [4 0 R 5 0 R 6 0 R] ',
    );

    const { result, bytes } = await publishedCopy(pdf);

    expect(result.removed).toEqual({ openAction: null, annotations: 2 });
    expect(await pageAnnotationTypes(result.pdf)).toEqual(['Link']);
    expect(bytes).not.toContain('catatan rahasia');
    expect(bytes).not.toContain('Pak Budi');
  });

  it('drops the /Annots array when only comments were on the page', async () => {
    const pdf = pdfWithPageAnnotation(
      '<< /Type /Annot /Subtype /Highlight /Rect [0 0 10 10] /T (Bu Sri) >>',
    );

    const { result, bytes } = await publishedCopy(pdf);

    expect(result.removed.annotations).toBe(1);
    expect(bytes).not.toContain('/Annots');
    expect(bytes).not.toContain('Bu Sri');
  });
});

describe('scanBookletPdf: private data, thumbnails and orphans', () => {
  it.each([
    [
      '/PieceInfo on the catalog',
      '/PieceInfo << /Illustrator << /Private (C:/Users/desainer/booklet.ai) >> >>',
      '',
    ],
    [
      '/PieceInfo on a page',
      '',
      '/PieceInfo << /Illustrator << /Private (C:/Users/desainer/booklet.ai) >> >> ',
    ],
    [
      '/PieceInfo under an escape pdf-lib keeps',
      '/PieceI#6efo << /Illustrator << /Private (C:/Users/desainer/booklet.ai) >> >>',
      '',
    ],
  ])('leaves out %s', async (_case, catalogExtra, pageExtra) => {
    const { bytes } = await publishedCopy(handWrittenPdf(catalogExtra, [], '', pageExtra));

    expect(bytes).not.toContain('desainer');
    expect(bytes).not.toContain('Illustrator');
  });

  it.each([
    ['a page thumbnail', '/Thumb 4 0 R '],
    ['a page thumbnail under an escape pdf-lib keeps', '/Thu#6db 4 0 R '],
  ])('leaves out %s and its image', async (_case, pageExtra) => {
    const thumbnail = pdfObject(
      4,
      '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 9 >>\nstream\nTHUMBDATA\nendstream',
    );

    const { bytes } = await publishedCopy(handWrittenPdf('', [thumbnail], '', pageExtra));

    expect(bytes).not.toContain('THUMBDATA');
    expect(bytes).not.toContain('Thu');
  });

  it('leaves out an object nothing refers to', async () => {
    const orphan = pdfObject(4, '<< /Draft (sisa draf lama: harga belum final) >>');

    const { bytes } = await publishedCopy(handWrittenPdf('', [orphan]));

    expect(bytes).not.toContain('sisa draf');
  });
});
