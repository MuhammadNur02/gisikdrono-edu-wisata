import { PDFDict, PDFName, PDFRef, PDFStream, type PDFDocument, type PDFObject } from 'pdf-lib';

import { nameSpellings } from '@/lib/uploads/pdf-names';

// docs/Security.md §8.4, decision of 2026-10-18: the published copy of a booklet carries no document metadata.
// The trailer's document information dictionary (Title, Author, Creator, Producer, dates, anything else a writer
// put there) goes, and so does every XMP packet: each /Metadata entry, on the catalog, a page, an image or a font,
// with the stream it points at, and any XMP stream left behind without one. EXIF inside embedded JPEGs is not
// touched; it is an accepted risk, see §8.4.

const METADATA_KEY = 'Metadata';
const XMP_TYPE = 'Metadata';

function isMetadataKey(key: PDFName): boolean {
  return nameSpellings(key).includes(METADATA_KEY);
}

function isXmpStream(object: PDFObject): boolean {
  if (!(object instanceof PDFStream)) return false;
  const type = object.dict.get(PDFName.of('Type'));
  return type instanceof PDFName && nameSpellings(type).includes(XMP_TYPE);
}

function dictOf(object: PDFObject): PDFDict | null {
  if (object instanceof PDFStream) return object.dict;
  return object instanceof PDFDict ? object : null;
}

// Drops the /Metadata entries of one dictionary and returns the streams they pointed at.
function dropMetadataEntries(dict: PDFDict): PDFRef[] {
  const entries = dict.entries().filter(([key]) => isMetadataKey(key));
  for (const [key] of entries) dict.delete(key);
  return entries.map(([, value]) => value).filter((value) => value instanceof PDFRef);
}

export function removeDocumentMetadata(document: PDFDocument): void {
  const { context } = document;
  const { Info: info } = context.trailerInfo;
  if (info instanceof PDFRef) context.delete(info);
  delete context.trailerInfo.Info;

  const unwanted: PDFRef[] = [];
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (isXmpStream(object)) unwanted.push(ref);
    const dict = dictOf(object);
    if (dict) unwanted.push(...dropMetadataEntries(dict));
  }
  for (const ref of unwanted) context.delete(ref);
}
