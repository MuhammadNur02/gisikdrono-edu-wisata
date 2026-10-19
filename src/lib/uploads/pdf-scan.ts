import { PDFDocument, PDFName, PDFRawStream, type PDFObject } from 'pdf-lib';

import { sortPageAnnotations } from '@/lib/uploads/pdf-annotations';
import { withInflateLimit } from '@/lib/uploads/pdf-inflate-guard';
import { removeDocumentMetadata } from '@/lib/uploads/pdf-metadata';
import { nameSpellings } from '@/lib/uploads/pdf-names';
import { removePageOnlyOpenAction, type OpenActionKind } from '@/lib/uploads/pdf-open-action';
import { readPageTree } from '@/lib/uploads/pdf-pages';
import { firstFinding, type Lookup } from '@/lib/uploads/pdf-rules';

// docs/Security.md §8.4 and UPL-05: a booklet PDF is published only when nothing in it can act on its own, and the
// copy that is published holds only what was checked. In order:
// 1. pdf-lib loads the whole file, objects after %%EOF included, under the inflate budget (./pdf-inflate-guard.ts);
//    an encrypted file or an object stream it could not unpack is refused.
// 2. An /OpenAction that only opens a page is removed (./pdf-open-action.ts); the page tree is read once per node,
//    at most 100 pages (./pdf-pages.ts); page annotations are sorted (./pdf-annotations.ts).
// 3. Every object is walked against the allowlist and the forbidden names (./pdf-rules.ts).
// 4. Metadata and every object the catalog no longer reaches are dropped (./pdf-metadata.ts), and pdf-lib writes
//    the copy, so no byte outside the checked objects (a polyglot's second file) reaches public-media.

export type PdfSanitizing = {
  openAction: OpenActionKind | null;
  // Comments and popups left out of the copy.
  annotations: number;
};

type Refusal = {
  ok: false;
  problem:
    'unreadable' | 'pdf_encrypted' | 'pdf_active_content' | 'pdf_link' | 'pdf_too_many_pages';
  // The offending name, link scheme or structure, for the upload_rejected event; never the link itself.
  detail?: string;
};

export type PdfScanResult =
  { ok: true; pageCount: number; pdf: Uint8Array; removed: PdfSanitizing } | Refusal;

const OBJECT_STREAM_TYPE = 'ObjStm';

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument | Refusal> {
  try {
    const loaded = await withInflateLimit(() =>
      PDFDocument.load(bytes, {
        throwOnInvalidObject: true,
        updateMetadata: false,
        ignoreEncryption: true,
      }),
    );
    if (!loaded.ok) return { ok: false, problem: 'unreadable', detail: `packed:${loaded.refusal}` };
    // Encrypted strings and streams cannot be read, so nothing in them could be checked.
    return loaded.value.isEncrypted ? { ok: false, problem: 'pdf_encrypted' } : loaded.value;
  } catch {
    return { ok: false, problem: 'unreadable' };
  }
}

// pdf-lib unpacks object streams while loading; one still packed is one it could not read.
function isObjectStream(object: PDFObject): boolean {
  if (!(object instanceof PDFRawStream)) return false;
  const type = object.dict.get(PDFName.of('Type'));
  return type instanceof PDFName && nameSpellings(type).includes(OBJECT_STREAM_TYPE);
}

function objectsOf(document: PDFDocument): PDFObject[] {
  return document.context.enumerateIndirectObjects().map(([, object]) => object);
}

// Step 2: what changes the document before it is checked, or why it is refused.
function prepare(document: PDFDocument): { pageCount: number; removed: PdfSanitizing } | Refusal {
  const openAction = removePageOnlyOpenAction(document);
  const tree = readPageTree(document);
  if (!tree.ok) return { ok: false, problem: tree.problem, detail: tree.detail };
  const annotations = sortPageAnnotations(document, tree.pages);
  if (!annotations.ok) return annotations;
  return {
    pageCount: tree.pages.length,
    removed: { openAction, annotations: annotations.removed },
  };
}

async function checkAndWrite(document: PDFDocument): Promise<PdfScanResult> {
  const prepared = prepare(document);
  if ('ok' in prepared) return prepared;
  const lookup: Lookup = (object) => document.context.lookup(object);
  const finding = firstFinding(objectsOf(document), lookup);
  if (finding) return { ok: false, ...finding };
  removeDocumentMetadata(document);
  // Neither option walks the page tree or adds a form, so the copy is the checked objects and nothing more.
  const pdf = await document.save({ addDefaultPage: false, updateFieldAppearances: false });
  return { ok: true, pageCount: prepared.pageCount, pdf, removed: prepared.removed };
}

export async function scanBookletPdf(bytes: Uint8Array): Promise<PdfScanResult> {
  const document = await loadPdf(bytes);
  if (!(document instanceof PDFDocument)) return document;
  if (objectsOf(document).some(isObjectStream)) return { ok: false, problem: 'unreadable' };
  try {
    return await checkAndWrite(document);
  } catch {
    // A file without a catalog loads, but cannot be read further.
    return { ok: false, problem: 'unreadable' };
  }
}

export type PublishedPageCount =
  { ok: true; pageCount: number } | { ok: false; problem: 'unreadable' | 'pdf_too_many_pages' };

// The page count of a booklet finalize published: pdf-lib's own output, read back by api/uploads/sign-pages with
// the same once-per-node walk, so even a file that reached public-media some other way cannot hold it.
export async function countPublishedPages(bytes: Uint8Array): Promise<PublishedPageCount> {
  const tree = readPageTree(await PDFDocument.load(bytes, { updateMetadata: false }));
  return tree.ok
    ? { ok: true, pageCount: tree.pages.length }
    : { ok: false, problem: tree.problem };
}
