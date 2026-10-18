import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { scanBookletPdf } from './pdf-scan';
import {
  cleanBookletPdf,
  handWrittenPdf,
  pdfWithLink,
  pdfWithScriptInObjectStream,
} from '../../../tests/fixtures/pdf';

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
    ['the hex-escaped /Open#41ction', '/Open#41ction << /S /GoTo /D [3 0 R /Fit] >>', 'OpenAction'],
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
    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({ detail: 'Launch' });
  });

  it('finds rich media and embedded file streams wherever they sit', async () => {
    const richMedia = handWrittenPdf('', [
      '4 0 obj\n<< /Type /Annot /Subtype /RichMedia >>\nendobj\n',
    ]);
    const embedded = handWrittenPdf('', [
      '4 0 obj\n<< /Type /EmbeddedFile /Length 0 >>\nstream\n\nendstream\nendobj\n',
    ]);
    await expect(scanBookletPdf(richMedia)).resolves.toMatchObject({ detail: 'RichMedia' });
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
    await expect(scanBookletPdf(pdf)).resolves.toEqual({ ok: false, problem: 'unreadable' });
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
});
