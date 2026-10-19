import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { scanBookletPdf } from './pdf-scan';
import { handWrittenPdf, pdfObject, pdfWithPageAnnotation } from '../../../tests/fixtures/pdf';

// Security review of PR #14, M1: a booklet may carry /Link annotations whose action is /GoTo or /URI and nothing
// else that acts. Each case is a file built to slip past the old list of forbidden names.

const LINK = '/Type /Annot /Subtype /Link /Rect [0 0 10 10]';
// A file to carry: an untyped stream, so only the key that points at it gives it away.
const FILE_STREAM = pdfObject(5, '<< /Length 2 >>\nstream\nMZ\nendstream');

async function annotationsOnPage(pdf: Uint8Array): Promise<string[]> {
  const copy = await PDFDocument.load(pdf);
  const annots = copy.getPage(0).node.lookup(PDFName.of('Annots'));
  if (!(annots instanceof PDFArray)) return [];
  return annots.asArray().map((entry) => {
    const annotation = copy.context.lookup(entry);
    const subtype = annotation instanceof PDFDict ? annotation.get(PDFName.of('Subtype')) : null;
    return subtype instanceof PDFName ? subtype.decodeText() : 'unknown';
  });
}

describe('scanBookletPdf: annotations on a page', () => {
  it.each([
    ['a file attachment', '/Subtype /FileAttachment /FS 5 0 R', 'annotation:FileAttachment'],
    ['a 3D model', '/Subtype /3D /3DD 5 0 R', 'annotation:3D'],
    ['rich media', '/Subtype /RichMedia', 'annotation:RichMedia'],
    ['a sound', '/Subtype /Sound /Sound 5 0 R', 'annotation:Sound'],
    ['a movie', '/Subtype /Movie /Movie << /F (film.mov) >>', 'annotation:Movie'],
    ['a screen', '/Subtype /Screen', 'annotation:Screen'],
    ['a form field', '/Subtype /Widget /FT /Btn', 'annotation:Widget'],
    ['a type the allowlist does not know', '/Subtype /Watermark', 'annotation:Watermark'],
    ['an annotation without a subtype', '', 'annotation:unknown'],
    ['a link spelled with an escape pdf-lib keeps', '/Subtype /Li#6ek', 'annotation:Li#6ek'],
  ])('refuses %s', async (_case, entries, detail) => {
    const pdf = pdfWithPageAnnotation(`<< /Type /Annot ${entries} /Rect [0 0 10 10] >>`, [
      FILE_STREAM,
    ]);

    await expect(scanBookletPdf(pdf)).resolves.toEqual({
      ok: false,
      problem: 'pdf_active_content',
      detail,
    });
  });

  it('refuses an annotation that leaves out /Type, which the format allows', async () => {
    const pdf = pdfWithPageAnnotation('<< /Subtype /FileAttachment /FS 5 0 R >>', [FILE_STREAM]);

    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({
      ok: false,
      detail: 'annotation:FileAttachment',
    });
  });
});

describe('scanBookletPdf: actions on a link', () => {
  it.each([
    ['JavaScript', '<< /S /JavaScript /JS (app.alert(1)) >>'],
    ['Launch', '<< /S /Launch /F (cmd.exe) >>'],
    ['Named', '<< /S /Named /N /Print >>'],
    ['Hide', '<< /S /Hide /T (x) >>'],
    ['Sound', '<< /S /Sound /Sound 5 0 R >>'],
    ['Movie', '<< /S /Movie /T (film) >>'],
    ['Rendition', '<< /S /Rendition /OP 0 >>'],
    ['Thread', '<< /S /Thread /D 0 >>'],
    ['SetOCGState', '<< /S /SetOCGState /State [/OFF] >>'],
    ['ResetForm', '<< /S /ResetForm >>'],
    ['Trans', '<< /S /Trans >>'],
    ['GoTo3DView', '<< /S /GoTo3DView /V 0 >>'],
  ])('refuses a %s action', async (kind, action) => {
    const pdf = pdfWithPageAnnotation(`<< ${LINK} /A ${action} >>`, [FILE_STREAM]);

    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({
      ok: false,
      problem: 'pdf_active_content',
      detail: `action:${kind}`,
    });
  });

  it.each([
    [
      'a /GoTo that chains a script with /Next',
      '<< /S /GoTo /D [3 0 R /Fit] /Next << /S /JavaScript /JS (x) >> >>',
    ],
    ['a /GoTo to something that is not a destination', '<< /S /GoTo /D << /S /Launch >> >>'],
    [
      'a /URI action with a key it has no use for',
      '<< /S /URI /URI (https://example.test/) /Next 5 0 R >>',
    ],
    ['an action without /S', '<< /URI (https://example.test/) >>'],
    ['an escaped /S value', '<< /S /G#6fTo /D [3 0 R /Fit] >>'],
  ])('refuses %s', async (_case, action) => {
    const pdf = pdfWithPageAnnotation(`<< ${LINK} /A ${action} >>`, [FILE_STREAM]);

    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({
      ok: false,
      problem: 'pdf_active_content',
    });
  });

  it('refuses additional actions on a link', async () => {
    const pdf = pdfWithPageAnnotation(
      `<< ${LINK} /AA << /E << /S /URI /URI (https://x.test/) >> >> >>`,
    );

    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({ detail: 'AA' });
  });

  it('holds a /PA action to the same rules as /A', async () => {
    const pdf = pdfWithPageAnnotation(`<< ${LINK} /PA << /S /URI /URI (javascript:x) >> >>`);

    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({ problem: 'pdf_link' });
  });

  it.each([
    ['a /GoTo to a page', `<< ${LINK} /A << /S /GoTo /D [3 0 R /Fit] >> >>`],
    ['a /GoTo to a named destination', `<< ${LINK} /A << /Type /Action /S /GoTo /D (sampul) >> >>`],
    ['an https /URI', `<< ${LINK} /A << /S /URI /URI (https://gisikdrono.example/) >> >>`],
    ['a mailto /URI', `<< ${LINK} /A << /S /URI /URI (mailto:info@example.test) >> >>`],
    ['a tel /URI', `<< ${LINK} /A << /S /URI /URI (tel:+6281200000000) >> >>`],
    ['a destination without an action', `<< ${LINK} /Dest [3 0 R /Fit] >>`],
  ])('publishes a link with %s and keeps it on the page', async (_case, annotation) => {
    const result = await scanBookletPdf(pdfWithPageAnnotation(annotation));

    expect(result).toMatchObject({ ok: true, removed: { openAction: null, annotations: 0 } });
    if (!result.ok) return;
    expect(await annotationsOnPage(result.pdf)).toEqual(['Link']);
  });
});

describe('scanBookletPdf: files carried inside or beside the PDF', () => {
  it.each([
    [
      'an embedded file stream with /Type',
      [pdfObject(4, '<< /Type /EmbeddedFile /Length 2 >>\nstream\nMZ\nendstream')],
      'EmbeddedFile',
    ],
    [
      'an embedded file stream without /Type behind a file specification',
      [pdfObject(4, '<< /Type /Filespec /F (a.exe) /EF << /F 5 0 R >> >>'), FILE_STREAM],
      'EF',
    ],
    [
      'a file specification without /Type',
      [pdfObject(4, '<< /F (a.exe) /EF << /F 5 0 R >> >>'), FILE_STREAM],
      'EF',
    ],
    [
      'related files',
      [pdfObject(4, '<< /Type /Filespec /F (a.zip) /RF << /F 5 0 R >> >>'), FILE_STREAM],
      'RF',
    ],
    [
      'a URL file system',
      [pdfObject(4, '<< /Type /Filespec /FS /URL /F (https://example.test/a.exe) >>')],
      'FS',
    ],
    [
      'a 3D stream outside any annotation',
      [pdfObject(4, '<< /Type /3D /Subtype /U3D /Length 0 >>\nstream\n\nendstream')],
      '3D',
    ],
  ])('refuses %s', async (_case, objects, detail) => {
    await expect(scanBookletPdf(handWrittenPdf('', objects))).resolves.toEqual({
      ok: false,
      problem: 'pdf_active_content',
      detail,
    });
  });

  it('refuses associated files on the catalog', async () => {
    const pdf = handWrittenPdf('/AF [4 0 R]', [pdfObject(4, '<< /F (data.xml) >>')]);

    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({ detail: 'AF' });
  });

  it('refuses article threads', async () => {
    const pdf = handWrittenPdf('/Threads [4 0 R]', [
      pdfObject(4, '<< /Type /Thread /F 5 0 R >>'),
      pdfObject(5, '<< /Type /Bead /T 4 0 R /P 3 0 R /R [0 0 10 10] >>'),
    ]);

    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({ detail: 'Thread' });
  });
});

// Security review of PR #14, F5 and F9: what a booklet has no use for, kept out of sight or parsed by a viewer's own
// libraries, is refused as unsupported content.
describe('scanBookletPdf: content a booklet does not need', () => {
  const IMAGE =
    '/Type /XObject /Subtype /Image /Width 1 /Height 1 /BitsPerComponent 8 /ColorSpace /DeviceGray';

  it.each([
    [
      'a form field holding a value',
      '/AcroForm << /Fields [4 0 R] >>',
      [pdfObject(4, '<< /FT /Tx /T (nomor_hp) /V (081234567890) >>')],
      'form:value',
    ],
    [
      'a form field holding a default value',
      '/AcroForm << /Fields [4 0 R] >>',
      [pdfObject(4, '<< /FT /Tx /T (nama) /DV (Pak Budi) >>')],
      'form:value',
    ],
    [
      'a child field holding the value its parent names',
      '/AcroForm << /Fields [4 0 R] >>',
      [
        pdfObject(4, '<< /T (alamat) /Kids [5 0 R] >>'),
        pdfObject(5, '<< /Parent 4 0 R /V (Jl. Mawar 5) >>'),
      ],
      'form:value',
    ],
    [
      "a signature's permissions",
      '/Perms << /DocMDP 4 0 R >>',
      [pdfObject(4, '<< /Type /Sig /Name (Pak Budi) /Reason (Disetujui) >>')],
      'Perms',
    ],
    [
      'a JBIG2 image',
      '',
      [pdfObject(4, `<< ${IMAGE} /Filter /JBIG2Decode /Length 1 >>\nstream\n0\nendstream`)],
      'JBIG2Decode',
    ],
    [
      'a JBIG2 global segment stream',
      '',
      [
        pdfObject(4, '<< /JBIG2Globals 5 0 R >>'),
        pdfObject(5, '<< /Length 1 >>\nstream\n0\nendstream'),
      ],
      'JBIG2Globals',
    ],
    [
      'a JPEG 2000 image',
      '',
      [pdfObject(4, `<< ${IMAGE} /Filter [/JPXDecode] /Length 1 >>\nstream\n0\nendstream`)],
      'JPXDecode',
    ],
    [
      'a PostScript XObject',
      '',
      [pdfObject(4, '<< /Type /XObject /Subtype /PS /Length 1 >>\nstream\n0\nendstream')],
      'xobject:PS',
    ],
  ])('refuses %s', async (_case, catalogExtra, objects, detail) => {
    await expect(scanBookletPdf(handWrittenPdf(catalogExtra, objects))).resolves.toEqual({
      ok: false,
      problem: 'pdf_unsupported_content',
      detail,
    });
  });

  it.each([
    ['a layer switched off', '/OCProperties << /OCGs [4 0 R] /D << /OFF [4 0 R] >> >>'],
    ['layers that start off', '/OCProperties << /OCGs [4 0 R] /D << /BaseState /OFF /ON [] >> >>'],
    [
      'layers set by usage',
      '/OCProperties << /OCGs [4 0 R] /D << /AS [<< /Event /View /OCGs [4 0 R] /Category [/View] >>] >> >>',
    ],
    ['layer properties without a default configuration', '/OCProperties << /OCGs [4 0 R] >>'],
  ])('refuses %s, whose content stays in the file out of sight', async (_case, catalogExtra) => {
    const layer = pdfObject(4, '<< /Type /OCG /Name (Catatan internal) >>');

    await expect(scanBookletPdf(handWrittenPdf(catalogExtra, [layer]))).resolves.toEqual({
      ok: false,
      problem: 'pdf_unsupported_content',
      detail: 'layer:hidden',
    });
  });

  it.each([
    [
      'visible layers',
      '/OCProperties << /OCGs [4 0 R] /D << /ON [4 0 R] /OFF [] >> >>',
      [pdfObject(4, '<< /Type /OCG /Name (Teks) >>')],
    ],
    [
      'an empty form field',
      '/AcroForm << /Fields [4 0 R] >>',
      [pdfObject(4, '<< /FT /Tx /T (kosong) >>')],
    ],
  ])('still publishes a booklet with %s', async (_case, catalogExtra, objects) => {
    await expect(scanBookletPdf(handWrittenPdf(catalogExtra, objects))).resolves.toMatchObject({
      ok: true,
    });
  });
});
