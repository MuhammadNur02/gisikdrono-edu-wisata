import { deflateSync } from 'node:zlib';

import {
  decodePDFRawStream,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFString,
  type PDFObject,
} from 'pdf-lib';

// Booklet PDFs for the scanner tests (docs/Security.md UPL-05). Hand-written ones keep the exact bytes a
// writer chose, such as a hex-escaped name, which pdf-lib would normalise if it wrote the file itself.

// An indirect object as a writer puts it in the file.
export function pdfObject(objectNumber: number, body: string): string {
  return `${String(objectNumber)} 0 obj\n${body}\nendobj\n`;
}

// A page tree of one page; `pageExtra` goes into the page dictionary, such as an /Annots array.
function pageObjects(pageExtra: string): string[] {
  return [
    pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    pdfObject(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] ${pageExtra}>>`),
  ];
}

// A PDF of exactly these objects, written in order with a cross-reference table; the trailer's /Root is 1 0 R.
export function pdfFromObjects(objects: string[], trailerExtra = ''): Buffer {
  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += object;
  }
  const xrefOffset = Buffer.byteLength(body, 'latin1');
  const rows = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${rows}`;
  body += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R ${trailerExtra}>>\n`;
  body += `startxref\n${String(xrefOffset)}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

// A one-page PDF whose catalog carries `catalogExtra`, plus any further objects (numbered from 4 by the caller).
export function handWrittenPdf(
  catalogExtra = '',
  extraObjects: string[] = [],
  trailerExtra = '',
  pageExtra = '',
) {
  const catalog = pdfObject(1, `<< /Type /Catalog /Pages 2 0 R ${catalogExtra} >>`);
  return pdfFromObjects([catalog, ...pageObjects(pageExtra), ...extraObjects], trailerExtra);
}

// A one-page PDF whose page lists object 4, `annotation`, in its /Annots, plus objects from 5 on.
export function pdfWithPageAnnotation(annotation: string, extraObjects: string[] = []): Buffer {
  return handWrittenPdf('', [pdfObject(4, annotation), ...extraObjects], '', '/Annots [4 0 R] ');
}

// A page with one link annotation pointing at `uri`.
export function pdfWithLink(uri: string): Buffer {
  return handWrittenPdf('', [
    `4 0 obj\n<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /A << /S /URI /URI (${uri}) >> >>\nendobj\n`,
  ]);
}

// A Flate-compressed stream object of `dictionary` whose content, `content` padded with spaces, inflates to
// `inflated` bytes: a few kilobytes of file can claim tens of megabytes.
export function packedStreamObject(
  objectNumber: number,
  dictionary: string,
  inflated: number,
  content = '',
): string {
  const unpacked = Buffer.alloc(inflated, ' ');
  unpacked.write(content, 'latin1');
  const packed = deflateSync(unpacked);
  const head = `<< ${dictionary} /Filter /FlateDecode /Length ${String(packed.length)} >>
stream
`;
  return pdfObject(
    objectNumber,
    `${head}${packed.toString('latin1')}
endstream`,
  );
}

// A one-page PDF carrying one such stream as object 4.
export function pdfWithPackedStream(dictionary: string, inflated: number): Buffer {
  return handWrittenPdf('', [packedStreamObject(4, dictionary, inflated)]);
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

function readableText(object: PDFObject): string {
  if (!(object instanceof PDFRawStream)) return object.toString();
  try {
    const content = Buffer.from(decodePDFRawStream(object).decode()).toString('latin1');
    return `${object.dict.toString()}\n${content}`;
  } catch {
    // A filter pdf-lib cannot decode (an image's DCT data): the raw bytes are what is there.
    return `${object.dict.toString()}\n${Buffer.from(object.contents).toString('latin1')}`;
  }
}

// A published copy as searchable text: every object pdf-lib reads back from it, each stream inflated. The copy packs
// ordinary objects into compressed object streams, so a search of its raw bytes cannot see what they hold (security
// review of PR #14, N2).
export async function readableCopy(pdf: Uint8Array): Promise<string> {
  const copy = await PDFDocument.load(pdf, { updateMetadata: false });
  return copy.context
    .enumerateIndirectObjects()
    .map(([, object]) => readableText(object))
    .join('\n');
}
