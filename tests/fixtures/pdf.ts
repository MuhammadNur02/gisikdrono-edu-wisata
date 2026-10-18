import { PDFDocument, PDFName, PDFString } from 'pdf-lib';

// Booklet PDFs for the scanner tests (docs/Security.md UPL-05). Hand-written ones keep the exact bytes a
// writer chose, such as a hex-escaped name, which pdf-lib would normalise if it wrote the file itself.

const PAGE_OBJECTS = [
  '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
  '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] >>\nendobj\n',
];

// A one-page PDF whose catalog carries `catalogExtra`, plus any further objects (numbered from 4 by the caller).
export function handWrittenPdf(catalogExtra = '', extraObjects: string[] = [], trailerExtra = '') {
  const objects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R ${catalogExtra} >>\nendobj\n`,
    ...PAGE_OBJECTS,
    ...extraObjects,
  ];
  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xrefOffset = body.length;
  const rows = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${rows}`;
  body += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R ${trailerExtra}>>\n`;
  body += `startxref\n${String(xrefOffset)}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

// A page with one link annotation pointing at `uri`.
export function pdfWithLink(uri: string): Buffer {
  return handWrittenPdf('', [
    `4 0 obj\n<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /A << /S /URI /URI (${uri}) >> >>\nendobj\n`,
  ]);
}

// A clean two-page booklet with the links a real one carries: the site, WhatsApp, email and phone.
export async function cleanBookletPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([420, 595]);
  document.addPage([420, 595]);
  const links = ['https://wa.me/6281200000000', 'mailto:info@example.test', 'tel:+6281200000000'];
  const annotations = links.map((uri, index) =>
    document.context.register(
      document.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [0, index * 20, 100, index * 20 + 15],
        A: { S: 'URI', URI: PDFString.of(uri) },
      }),
    ),
  );
  page.node.set(PDFName.of('Annots'), document.context.obj(annotations));
  return document.save();
}

// A JavaScript open action that pdf-lib packs into a compressed object stream, so a plain text search of the
// file finds nothing.
export async function pdfWithScriptInObjectStream(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage();
  document.catalog.set(
    PDFName.of('OpenAction'),
    document.context.obj({ S: 'JavaScript', JS: PDFString.of('app.alert(1)') }),
  );
  return document.save({ useObjectStreams: true });
}
