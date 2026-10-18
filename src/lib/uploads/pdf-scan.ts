import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFStream,
  PDFString,
  type PDFObject,
} from 'pdf-lib';

import { BOOKLET_LINK_SCHEMES, MAX_BOOKLET_PAGES } from '@/config/uploads';
import { nameSpellings } from '@/lib/uploads/pdf-names';
import { removePageOnlyOpenAction, type OpenActionKind } from '@/lib/uploads/pdf-open-action';

// docs/Security.md §8.4 and UPL-05: a booklet PDF is published only when nothing in it can act on its own.
// pdf-lib parses the whole file, including objects appended after %%EOF, and decodes object streams, so every
// object is walked, not only the catalog, and names are compared in every spelling (./pdf-names.ts). An
// /OpenAction that only opens a page is removed first (./pdf-open-action.ts); every other one is refused. What
// gets published is pdf-lib's re-serialisation of the objects that were checked, so no byte outside them (a
// polyglot's second file, junk after the last object) reaches public-media. A booklet holds at most 100 pages.

export type PdfScanResult =
  | {
      ok: true;
      pageCount: number;
      pdf: Uint8Array;
      // What the published copy left out, for the upload_sanitized event.
      removedOpenAction: OpenActionKind | null;
    }
  | {
      ok: false;
      problem:
        'unreadable' | 'pdf_encrypted' | 'pdf_active_content' | 'pdf_link' | 'pdf_too_many_pages';
      // The offending name or link scheme, for the upload_rejected event; never the link itself.
      detail?: string;
    };

type Finding = { problem: 'pdf_active_content' | 'pdf_link'; detail: string };

// The documented list plus their siblings: the name-tree key of embedded files, XFA forms, and the actions
// that submit, import, open other documents or play media.
const FORBIDDEN_NAMES = new Set([
  'OpenAction',
  'AA',
  'JavaScript',
  'JS',
  'Launch',
  'EmbeddedFile',
  'EmbeddedFiles',
  'RichMedia',
  'XFA',
  'SubmitForm',
  'ImportData',
  'GoToE',
  'GoToR',
  'Rendition',
]);
const URI_KEY = 'URI';
const OBJECT_STREAM_TYPE = 'ObjStm';

function forbiddenName(name: PDFName): string | undefined {
  return nameSpellings(name).find((spelling) => FORBIDDEN_NAMES.has(spelling));
}

function linkSchemeProblem(value: PDFObject | undefined): Finding | null {
  const text =
    value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : null;
  if (text === null) return { problem: 'pdf_link', detail: 'not-a-string' };
  try {
    const url = new URL(text);
    const isAllowed = BOOKLET_LINK_SCHEMES.includes(url.protocol) && !url.username && !url.password;
    return isAllowed ? null : { problem: 'pdf_link', detail: url.protocol };
  } catch {
    return { problem: 'pdf_link', detail: 'unparsable' };
  }
}

// Resolves a reference to the object it points at (pdf-lib's context.lookup).
type Lookup = (object: PDFObject) => PDFObject | undefined;

// References are not followed here: every indirect object is walked on its own.
function findIn(object: PDFObject, lookup: Lookup): Finding | null {
  if (object instanceof PDFName) {
    const name = forbiddenName(object);
    return name ? { problem: 'pdf_active_content', detail: name } : null;
  }
  if (object instanceof PDFStream) return findIn(object.dict, lookup);
  if (object instanceof PDFArray) return firstFinding(object.asArray(), lookup);
  if (object instanceof PDFDict) return findInDict(object, lookup);
  return null;
}

function firstFinding(objects: PDFObject[], lookup: Lookup): Finding | null {
  for (const object of objects) {
    const finding = findIn(object, lookup);
    if (finding) return finding;
  }
  return null;
}

// A /URI value may sit in an object of its own, so it is looked up and cannot hide behind a reference.
function findInDict(dict: PDFDict, lookup: Lookup): Finding | null {
  for (const [key, value] of dict.entries()) {
    const isUri = nameSpellings(key).includes(URI_KEY);
    const finding =
      findIn(key, lookup) ?? (isUri ? linkSchemeProblem(lookup(value)) : findIn(value, lookup));
    if (finding) return finding;
  }
  return null;
}

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument | 'unreadable' | 'pdf_encrypted'> {
  try {
    const document = await PDFDocument.load(bytes, {
      throwOnInvalidObject: true,
      updateMetadata: false,
      ignoreEncryption: true,
    });
    // Encrypted strings and streams cannot be read, so nothing in them could be checked.
    return document.isEncrypted ? 'pdf_encrypted' : document;
  } catch {
    return 'unreadable';
  }
}

// A file without a catalog or page tree loads, but cannot be counted or written.
async function publishable(
  document: PDFDocument,
  removedOpenAction: OpenActionKind | null,
): Promise<PdfScanResult> {
  try {
    const pageCount = document.getPageCount();
    if (pageCount === 0) return { ok: false, problem: 'unreadable' };
    if (pageCount > MAX_BOOKLET_PAGES) {
      return { ok: false, problem: 'pdf_too_many_pages', detail: String(pageCount) };
    }
    return { ok: true, pageCount, pdf: await document.save(), removedOpenAction };
  } catch {
    return { ok: false, problem: 'unreadable' };
  }
}

// The catalog itself is missing in a file that only looks like a PDF.
function removeOpenAction(document: PDFDocument): OpenActionKind | null | 'unreadable' {
  try {
    return removePageOnlyOpenAction(document);
  } catch {
    return 'unreadable';
  }
}

// pdf-lib unpacks object streams while loading; one still packed is one it could not read.
function isObjectStream(object: PDFObject): boolean {
  if (!(object instanceof PDFRawStream)) return false;
  const type = object.dict.get(PDFName.of('Type'));
  return type instanceof PDFName && nameSpellings(type).includes(OBJECT_STREAM_TYPE);
}

export async function scanBookletPdf(bytes: Uint8Array): Promise<PdfScanResult> {
  const document = await loadPdf(bytes);
  if (typeof document === 'string') return { ok: false, problem: document };

  const objects = document.context.enumerateIndirectObjects().map(([, object]) => object);
  if (objects.some(isObjectStream)) return { ok: false, problem: 'unreadable' };

  const removedOpenAction = removeOpenAction(document);
  if (removedOpenAction === 'unreadable') return { ok: false, problem: 'unreadable' };
  const finding = firstFinding(objects, (object) => document.context.lookup(object));
  if (finding) return { ok: false, ...finding };
  return publishable(document, removedOpenAction);
}

// The page count of a booklet finalize published: pdf-lib's own output, read back by api/uploads/sign-pages.
export async function countPublishedPages(bytes: Uint8Array): Promise<number> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  return document.getPageCount();
}
