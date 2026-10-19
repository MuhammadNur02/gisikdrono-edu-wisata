import { PDFDocument, PDFName, PDFRawStream, type PDFDict, type PDFObject } from 'pdf-lib';

import { checkPageAnnotations, removeComments } from '@/lib/uploads/pdf-annotations';
import { ScanDeadline, ScanTimeout } from '@/lib/uploads/pdf-deadline';
import { withLoadLimits, type LoadRefusal } from '@/lib/uploads/pdf-load-guard';
import { removeDocumentMetadata } from '@/lib/uploads/pdf-metadata';
import { nameSpellings } from '@/lib/uploads/pdf-names';
import { removePageOnlyOpenAction, type OpenActionKind } from '@/lib/uploads/pdf-open-action';
import { readPageTree } from '@/lib/uploads/pdf-pages';
import { firstFinding, hiddenLayerFinding, type Lookup, type Walk } from '@/lib/uploads/pdf-rules';

// docs/Security.md §8.4 and UPL-05: a booklet PDF is published only when nothing in it can act on its own, and the
// copy that is published holds only what was checked. In order:
// 1. pdf-lib loads the whole file, objects after %%EOF included, under the scan's limits (./pdf-load-guard.ts): one
//    inflate budget for the document, a count of parsed objects, bounds on object numbers and name lengths, and a
//    deadline (./pdf-deadline.ts) that the walks after the load step on too; an encrypted file or an object stream it
//    could not unpack is refused.
// 2. An /OpenAction that only opens a page is removed (./pdf-open-action.ts); the page tree is read once per node,
//    at most 100 pages (./pdf-pages.ts); page annotations are only links and comments (./pdf-annotations.ts).
// 3. Every object is walked against the allowlist, the forbidden names and the content a booklet does not need, and
//    a layer the document opens hidden refuses it (./pdf-rules.ts).
// 4. Comments go whole (./pdf-annotations.ts), then metadata and every object the catalog no longer reaches
//    (./pdf-metadata.ts), and pdf-lib writes the copy, so no byte outside the checked objects (a polyglot's second
//    file) reaches public-media.

export type PdfSanitizing = {
  openAction: OpenActionKind | null;
  // Comments and popups left out of the copy.
  annotations: number;
};

type Refusal = {
  ok: false;
  problem:
    | 'unreadable'
    | 'pdf_encrypted'
    | 'pdf_active_content'
    | 'pdf_link'
    | 'pdf_too_many_pages'
    | 'pdf_too_complex'
    | 'pdf_unsupported_content';
  // The offending name, link scheme or structure, for the upload_rejected event; never the link itself.
  detail?: string;
};

export type PdfScanResult =
  { ok: true; pageCount: number; pdf: Uint8Array; removed: PdfSanitizing } | Refusal;

const OBJECT_STREAM_TYPE = 'ObjStm';
const RESOURCE_LIMITS: ReadonlySet<LoadRefusal> = new Set([
  'too_large',
  'too_many_objects',
  'object_number_too_high',
  'name_too_long',
  'too_slow',
]);

// A file over one of the scan's limits is too heavy to check; a stream that cannot be unpacked is unreadable.
function limitRefusal(refusal: LoadRefusal): Refusal {
  return RESOURCE_LIMITS.has(refusal)
    ? { ok: false, problem: 'pdf_too_complex', detail: `limit:${refusal}` }
    : { ok: false, problem: 'unreadable', detail: `packed:${refusal}` };
}

async function loadPdf(bytes: Uint8Array, deadlineMs: number): Promise<PDFDocument | Refusal> {
  try {
    const loaded = await withLoadLimits(
      () =>
        PDFDocument.load(bytes, {
          throwOnInvalidObject: true,
          updateMetadata: false,
          ignoreEncryption: true,
        }),
      deadlineMs,
    );
    if (!loaded.ok) return limitRefusal(loaded.refusal);
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
function prepare(
  document: PDFDocument,
): { pages: PDFDict[]; openAction: OpenActionKind | null } | Refusal {
  const openAction = removePageOnlyOpenAction(document);
  const tree = readPageTree(document);
  if (!tree.ok) return { ok: false, problem: tree.problem, detail: tree.detail };
  const annotations = checkPageAnnotations(document, tree.pages);
  if (!annotations.ok) return annotations;
  return { pages: tree.pages, openAction };
}

async function checkAndWrite(
  document: PDFDocument,
  deadline: ScanDeadline,
): Promise<PdfScanResult> {
  const prepared = prepare(document);
  if ('ok' in prepared) return prepared;
  const lookup: Lookup = (object) => document.context.lookup(object);
  const walk: Walk = { lookup, deadline };
  const finding =
    firstFinding(objectsOf(document), walk) ?? hiddenLayerFinding(document.catalog, lookup);
  if (finding) return { ok: false, ...finding };
  const annotations = removeComments(document, prepared.pages, deadline);
  removeDocumentMetadata(document);
  if (deadline.isPast()) return limitRefusal('too_slow');
  // Neither option walks the page tree or adds a form, so the copy is the checked objects and nothing more.
  const pdf = await document.save({ addDefaultPage: false, updateFieldAppearances: false });
  const removed = { openAction: prepared.openAction, annotations };
  return { ok: true, pageCount: prepared.pages.length, pdf, removed };
}

export async function scanBookletPdf(bytes: Uint8Array): Promise<PdfScanResult> {
  const deadline = ScanDeadline.fromNow();
  const document = await loadPdf(bytes, deadline.atMs);
  if (!(document instanceof PDFDocument)) return document;
  if (objectsOf(document).some(isObjectStream)) return { ok: false, problem: 'unreadable' };
  try {
    return await checkAndWrite(document, deadline);
  } catch (error) {
    if (error instanceof ScanTimeout) return limitRefusal('too_slow');
    // A file without a catalog loads, but cannot be read further.
    return { ok: false, problem: 'unreadable' };
  }
}

export type PublishedPageCount =
  | { ok: true; pageCount: number }
  | { ok: false; problem: 'unreadable' | 'pdf_too_many_pages' | 'pdf_too_complex' };

// The page count of a booklet finalize published: pdf-lib's own output, read back by api/uploads/sign-pages under
// the same limits and with the same once-per-node walk, so even a file that reached public-media some other way
// cannot hold it. A file pdf-lib cannot read, or one it loads without a catalog to read pages from, is answered as
// unreadable, not as a server error (security review of PR #14, F8).
export async function countPublishedPages(bytes: Uint8Array): Promise<PublishedPageCount> {
  try {
    const loaded = await withLoadLimits(
      () => PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true }),
      ScanDeadline.fromNow().atMs,
    );
    if (!loaded.ok) return { ok: false, problem: 'pdf_too_complex' };
    const tree = readPageTree(loaded.value);
    return tree.ok
      ? { ok: true, pageCount: tree.pages.length }
      : { ok: false, problem: tree.problem };
  } catch {
    return { ok: false, problem: 'unreadable' };
  }
}
