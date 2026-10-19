import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFRef,
  PDFStream,
  type PDFDocument,
  type PDFObject,
} from 'pdf-lib';

import { nameSpellings } from '@/lib/uploads/pdf-names';

// docs/Security.md §8.4: the published copy of a booklet carries no document metadata and nothing a reader cannot
// reach. The trailer's document information dictionary goes (Title, Author, Creator, Producer, dates), and so does
// every XMP packet (each /Metadata entry with its stream, and any XMP stream left without one), every /PieceInfo
// (an application's private data, which can hold the designer's file paths) and every page /Thumb. Then every
// object the catalog no longer reaches is dropped: old revisions, removed comments, orphans a writer left behind
// (security review of PR #14, L4). EXIF inside embedded JPEGs is not touched; it is an accepted risk, see §8.4.

// Keys whose value is metadata, never content.
// /LastModified dates a page or the document's private data (security review of PR #14, F5).
const METADATA_KEYS = ['Metadata', 'PieceInfo', 'Thumb', 'LastModified'];
const XMP_TYPE = 'Metadata';

function isMetadataKey(key: PDFName): boolean {
  return nameSpellings(key).some((spelling) => METADATA_KEYS.includes(spelling));
}

function isXmpStream(object: PDFObject): boolean {
  if (!(object instanceof PDFStream)) return false;
  const type = object.dict.get(PDFName.of('Type'));
  return type instanceof PDFName && nameSpellings(type).includes(XMP_TYPE);
}

function dictOf(object: PDFObject | undefined): PDFDict | null {
  if (object instanceof PDFStream) return object.dict;
  return object instanceof PDFDict ? object : null;
}

function dropMetadataEntries(dict: PDFDict): void {
  for (const [key] of dict.entries().filter(([entryKey]) => isMetadataKey(entryKey))) {
    dict.delete(key);
  }
}

// The trailer's /ID goes with the information dictionary: the authoring tool derives it from the source file, so it
// ties the booklet to that file and its other versions (security review of PR #14, F5). An unencrypted PDF needs
// none.
function removeDocumentInformation(document: PDFDocument): void {
  const { context } = document;
  const { Info: info } = context.trailerInfo;
  if (info instanceof PDFRef) context.delete(info);
  delete context.trailerInfo.Info;
  delete context.trailerInfo.ID;
}

// The references an object holds directly: in itself, its arrays and dictionaries, a stream's dictionary.
function referencesIn(object: PDFObject | undefined): PDFRef[] {
  const found: PDFRef[] = [];
  const pending: (PDFObject | undefined)[] = [object];
  while (pending.length > 0) {
    const next = pending.pop();
    if (next instanceof PDFRef) found.push(next);
    else if (next instanceof PDFArray) pending.push(...next.asArray());
    else
      pending.push(
        ...(dictOf(next)
          ?.entries()
          .map(([, value]) => value) ?? []),
      );
  }
  return found;
}

// Everything the trailer's /Root reaches stays; the rest is never written.
function removeUnreachableObjects(document: PDFDocument): void {
  const { context } = document;
  const reached = new Set<string>();
  const pending: PDFRef[] = referencesIn(context.trailerInfo.Root);
  while (pending.length > 0) {
    const next = pending.pop();
    if (!next || reached.has(next.tag)) continue;
    reached.add(next.tag);
    pending.push(...referencesIn(context.lookup(next)));
  }
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!reached.has(ref.tag)) context.delete(ref);
  }
}

export function removeDocumentMetadata(document: PDFDocument): void {
  removeDocumentInformation(document);
  for (const [ref, object] of document.context.enumerateIndirectObjects()) {
    if (isXmpStream(object)) {
      document.context.delete(ref);
      continue;
    }
    const dict = dictOf(object);
    if (dict) dropMetadataEntries(dict);
  }
  removeUnreachableObjects(document);
}
