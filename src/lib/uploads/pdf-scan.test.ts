import { PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';

import { countPublishedPages, scanBookletPdf } from './pdf-scan';
import {
  cleanBookletPdf,
  handWrittenPdf,
  pdfWithLink,
  pdfWithScriptInObjectStream,
  readableCopy,
} from '../../../tests/fixtures/pdf';
import { HEAVY_FILE_TEST_TIMEOUT_MS } from '../../../tests/fixtures/timeouts';

vi.setConfig({ testTimeout: HEAVY_FILE_TEST_TIMEOUT_MS });

describe('scanBookletPdf', () => {
  it('publishes a clean booklet with its https, mailto and tel links and counts its pages', async () => {
    const result = await scanBookletPdf(await cleanBookletPdf());

    expect(result).toMatchObject({ ok: true, pageCount: 2 });
    if (!result.ok) return;
    const republished = await PDFDocument.load(result.pdf);
    expect(republished.getPageCount()).toBe(2);
  });

  it.each([
    [
      'a JavaScript open action',
      '/OpenAction << /S /JavaScript /JS (app.alert(1)) >>',
      'OpenAction',
    ],
    [
      'the hex-escaped /Open#41ction with a script',
      '/Open#41ction << /S /JavaScript /JS (app.alert(1)) >>',
      'OpenAction',
    ],
    ['a lower-case escape pdf-lib leaves alone', '/Names << /#4aavaScript 4 0 R >>', 'JavaScript'],
    ['an escape inside a value', '/Foo << /S /J#61vaScript >>', 'JavaScript'],
    ['document-level additional actions', '/AA << /WC << /S /Named /N /Print >> >>', 'AA'],
    ['embedded files', '/Names << /EmbeddedFiles << /Names [] >> >>', 'EmbeddedFiles'],
    ['an XFA form', '/AcroForm << /Fields [] /XFA 4 0 R >>', 'XFA'],
  ])('refuses %s', async (_case, catalogExtra, detail) => {
    await expect(scanBookletPdf(handWrittenPdf(catalogExtra))).resolves.toEqual({
      ok: false,
      problem: 'pdf_active_content',
      detail,
    });
  });

  it('finds active content outside the catalog: a launch action on a page annotation', async () => {
    const pdf = handWrittenPdf('', [
      '4 0 obj\n<< /Type /Annot /Subtype /Link /A << /S /Launch /F (cmd.exe) >> >>\nendobj\n',
    ]);
    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({ detail: 'action:Launch' });
  });

  it('finds rich media and embedded file streams wherever they sit', async () => {
    const richMedia = handWrittenPdf('', [
      '4 0 obj\n<< /Type /Annot /Subtype /RichMedia >>\nendobj\n',
    ]);
    const embedded = handWrittenPdf('', [
      '4 0 obj\n<< /Type /EmbeddedFile /Length 0 >>\nstream\n\nendstream\nendobj\n',
    ]);
    await expect(scanBookletPdf(richMedia)).resolves.toMatchObject({
      detail: 'annotation:RichMedia',
    });
    await expect(scanBookletPdf(embedded)).resolves.toMatchObject({ detail: 'EmbeddedFile' });
  });

  it('decodes object streams before it looks', async () => {
    const pdf = await pdfWithScriptInObjectStream();
    expect(Buffer.from(pdf).toString('latin1')).not.toContain('OpenAction');

    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({
      ok: false,
      problem: 'pdf_active_content',
    });
  });

  it('reads objects appended after %%EOF', async () => {
    const pdf = Buffer.concat([
      handWrittenPdf(),
      Buffer.from('9 0 obj\n<< /S /JavaScript /JS (app.alert(1)) >>\nendobj\n', 'latin1'),
    ]);
    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({ detail: 'JavaScript' });
  });

  it.each([
    ['plain http', 'http://example.test/', 'http:'],
    ['javascript', 'javascript:app.alert(1)', 'javascript:'],
    ['javascript hidden by a tab', 'java\tscript:app.alert(1)', 'javascript:'],
    ['a local file', 'file:///C:/Windows/system32/cmd.exe', 'file:'],
    ['a data URL', 'data:text/html,<script>alert(1)</script>', 'data:'],
    ['https with credentials', 'https://user:secret@example.test/', 'https:'],
    ['a relative link', 'halaman-2.html', 'unparsable'],
  ])('refuses a link to %s', async (_case, uri, detail) => {
    await expect(scanBookletPdf(pdfWithLink(uri))).resolves.toEqual({
      ok: false,
      problem: 'pdf_link',
      detail,
    });
  });

  it('looks up a link that hides behind a reference', async () => {
    const pdf = handWrittenPdf('', [
      '4 0 obj\n<< /Type /Annot /Subtype /Link /A << /S /URI /URI 5 0 R >> >>\nendobj\n',
      '5 0 obj\n(javascript:app.alert(1))\nendobj\n',
    ]);
    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({ problem: 'pdf_link' });
  });

  it('refuses an encrypted PDF it cannot look inside', async () => {
    const pdf = handWrittenPdf('', [], '/Encrypt << /Filter /Standard >> ');
    await expect(scanBookletPdf(pdf)).resolves.toEqual({ ok: false, problem: 'pdf_encrypted' });
  });

  it('refuses an object stream it cannot decode', async () => {
    const inner = '5 0 << /S /JavaScript /JS (x) >>';
    const pdf = handWrittenPdf('', [
      `4 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Length ${String(inner.length)} /Filter /BogusDecode >>\nstream\n${inner}\nendstream\nendobj\n`,
    ]);
    await expect(scanBookletPdf(pdf)).resolves.toEqual({
      ok: false,
      problem: 'unreadable',
      detail: 'packed:unsupported_filter',
    });
  });

  it('refuses garbage, a truncated file and a PDF without pages', async () => {
    const clean = await cleanBookletPdf();
    const noPages = handWrittenPdf()
      .toString('latin1')
      .replace('/Kids [3 0 R] /Count 1', '/Kids [] /Count 0');

    await expect(scanBookletPdf(Buffer.from('%PDF-1.7\nnot really'))).resolves.toMatchObject({
      ok: false,
    });
    await expect(scanBookletPdf(clean.subarray(0, 40))).resolves.toMatchObject({ ok: false });
    await expect(scanBookletPdf(Buffer.from(noPages, 'latin1'))).resolves.toEqual({
      ok: false,
      problem: 'unreadable',
      detail: 'no-pages',
    });
  });

  it('publishes only the objects it checked, so a polyglot loses its second file', async () => {
    const polyglot = Buffer.concat([
      handWrittenPdf(),
      Buffer.from('<html><script>alert("polyglot")</script></html>', 'latin1'),
    ]);

    const result = await scanBookletPdf(polyglot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Buffer.from(result.pdf).toString('latin1')).not.toContain('polyglot');
  });

  it('refuses a booklet over 100 pages and accepts one of exactly 100', async () => {
    const pdfWith = async (pages: number) => {
      const document = await PDFDocument.create();
      for (let page = 0; page < pages; page += 1) document.addPage([420, 595]);
      return document.save();
    };

    await expect(scanBookletPdf(await pdfWith(101))).resolves.toEqual({
      ok: false,
      problem: 'pdf_too_many_pages',
      detail: 'more than 100',
    });
    await expect(scanBookletPdf(await pdfWith(100))).resolves.toMatchObject({
      ok: true,
      pageCount: 100,
    });
  });
});

// docs/Security.md §8.4, decision of 2026-10-18.
describe('scanBookletPdf: an /OpenAction that only opens a page', () => {
  async function openActionOf(pdf: Uint8Array) {
    const republished = await PDFDocument.load(pdf);
    return republished.catalog.get(PDFName.of('OpenAction'));
  }

  it.each([
    ['a destination array', '/OpenAction [3 0 R /Fit]', 'destination'],
    ['a destination with its zoom', '/OpenAction [3 0 R /XYZ null null 0]', 'destination'],
    ['a page index destination', '/OpenAction [0 /FitH 595]', 'destination'],
    ['a /GoTo action', '/OpenAction << /S /GoTo /D [3 0 R /Fit] >>', 'goto'],
    [
      'a /GoTo action to a named destination',
      '/OpenAction << /Type /Action /S /GoTo /D (sampul) >>',
      'goto',
    ],
    ['a hex-escaped key', '/Open#41ction [3 0 R /Fit]', 'destination'],
    ['a lower-case escaped key', '/Ope#6eAction [3 0 R /Fit]', 'destination'],
  ])('leaves out %s and says so', async (_case, catalogExtra, kind) => {
    const result = await scanBookletPdf(handWrittenPdf(catalogExtra));

    expect(result).toMatchObject({
      ok: true,
      pageCount: 1,
      removed: { openAction: kind, annotations: 0 },
    });
    if (!result.ok) return;
    expect(await openActionOf(result.pdf)).toBeUndefined();
  });

  it('follows a reference to the /GoTo action before deciding', async () => {
    const pdf = handWrittenPdf('/OpenAction 4 0 R', [
      '4 0 obj\n<< /S /GoTo /D [3 0 R /Fit] >>\nendobj\n',
    ]);

    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({
      ok: true,
      removed: { openAction: 'goto', annotations: 0 },
    });
  });

  it.each([
    [
      'a /GoTo that chains a script with /Next',
      '/OpenAction << /S /GoTo /D [3 0 R /Fit] /Next << /S /JavaScript /JS (x) >> >>',
    ],
    ['a /GoTo with a key it has no use for', '/OpenAction << /S /GoTo /D [3 0 R /Fit] /F (x) >>'],
    [
      'a /GoTo to something that is not a destination',
      '/OpenAction << /S /GoTo /D << /S /Launch >> >>',
    ],
    ['an escaped /GoTo pdf-lib did not decode', '/OpenAction << /S /G#6fTo /D [3 0 R /Fit] >>'],
    ['a remote /GoToR', '/OpenAction << /S /GoToR /F (lain.pdf) /D [0 /Fit] >>'],
    ['a destination with a string in its frame', '/OpenAction [3 0 R /Fit (x)]'],
    ['a destination with an unknown fit', '/OpenAction [3 0 R /Zoom 2]'],
    ['a named destination on its own', '/OpenAction (sampul)'],
    [
      'a page-only one next to a script under a second spelling',
      '/OpenAction [3 0 R /Fit] /Ope#6eAction << /S /JavaScript /JS (x) >>',
    ],
  ])('still refuses %s', async (_case, catalogExtra) => {
    await expect(scanBookletPdf(handWrittenPdf(catalogExtra))).resolves.toMatchObject({
      ok: false,
      problem: 'pdf_active_content',
    });
  });

  it('removes nothing from a booklet without one', async () => {
    await expect(scanBookletPdf(await cleanBookletPdf())).resolves.toMatchObject({
      ok: true,
      removed: { openAction: null, annotations: 0 },
    });
  });
});

// docs/Security.md §8.4, decision of 2026-10-18.
describe('scanBookletPdf: the published copy carries no document metadata', () => {
  const XMP =
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">' +
    '<dc:creator>Pak Budi</dc:creator><exif:GPSLatitude>6,58.0S</exif:GPSLatitude></x:xmpmeta>';

  function xmpStream(objectNumber: number): string {
    return `${String(objectNumber)} 0 obj\n<< /Type /Metadata /Subtype /XML /Length ${String(XMP.length)} >>\nstream\n${XMP}\nendstream\nendobj\n`;
  }

  // Info in the trailer, XMP on the catalog, on an image and one left without a reference.
  function pdfFullOfMetadata(): Buffer {
    return handWrittenPdf(
      '/Metadata 4 0 R',
      [
        xmpStream(4),
        '5 0 obj\n<< /Title (Booklet RW 05) /Author (Pak Budi) /Creator (Canva) /Producer (Canva) /CreationDate (D:20261018090000+07) /Keywords (Bank Sampah) >>\nendobj\n',
        '6 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Metadata 7 0 R /Length 1 >>\nstream\n\u0000\nendstream\nendobj\n',
        xmpStream(7),
        xmpStream(8),
      ],
      '/Info 5 0 R ',
    );
  }

  async function republished(pdf: Uint8Array) {
    return PDFDocument.load(pdf, { updateMetadata: false });
  }

  it('leaves out the document information dictionary', async () => {
    const result = await scanBookletPdf(pdfFullOfMetadata());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const copy = await republished(result.pdf);
    expect(copy.context.trailerInfo.Info).toBeUndefined();
    expect([copy.getTitle(), copy.getAuthor(), copy.getCreator(), copy.getProducer()]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(copy.getKeywords()).toBeUndefined();
    expect(copy.getCreationDate()).toBeUndefined();
  });

  it('leaves out every XMP packet, on the catalog, on an image and one left over', async () => {
    const result = await scanBookletPdf(pdfFullOfMetadata());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const copy = await republished(result.pdf);
    expect(copy.catalog.get(PDFName.of('Metadata'))).toBeUndefined();
    // Read back with every stream inflated: the copy's compressed object streams hide text from a byte search (N2).
    const readable = await readableCopy(result.pdf);
    expect(readable).not.toContain('xmpmeta');
    expect(readable).not.toContain('Pak Budi');
    expect(readable).not.toContain('GPSLatitude');
    expect(readable).not.toContain('/Metadata');
  });

  it('strips what a PDF writer stamps by default', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    document.setAuthor('Pak Budi');
    document.setCreator('Microsoft Word');

    const result = await scanBookletPdf(await document.save());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const copy = await republished(result.pdf);
    expect([copy.getAuthor(), copy.getCreator(), copy.getProducer()]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('countPublishedPages', () => {
  it('reads the page count of a published booklet', async () => {
    const result = await scanBookletPdf(await cleanBookletPdf());
    if (!result.ok) throw new Error('the clean booklet should pass');

    await expect(countPublishedPages(result.pdf)).resolves.toEqual({ ok: true, pageCount: 2 });
  });
});
