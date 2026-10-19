import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFRef,
  PDFString,
  type PDFDocument,
  type PDFObject,
} from 'pdf-lib';

import { nameSpellings } from '@/lib/uploads/pdf-names';

// docs/Security.md §8.4, decision of 2026-10-18: LibreOffice and InDesign often write an /OpenAction that only
// opens a page. When every /OpenAction of the catalog is exactly that, an explicit destination array or a bare
// /GoTo action to a destination, it is left out of the re-serialised copy and finalize records upload_sanitized.
// Anything else in it (JavaScript, a /Next chain, an unknown key, an escaped spelling pdf-lib did not decode) is
// left in place for the scan to refuse as upload_rejected.

export type OpenActionKind = 'destination' | 'goto';

type Lookup = (object: PDFObject | undefined) => PDFObject | undefined;

const OPEN_ACTION = 'OpenAction';
// The ways an explicit destination frames its page (ISO 32000-1 §12.3.2.2).
const DESTINATION_FITS = new Set(['XYZ', 'Fit', 'FitH', 'FitV', 'FitR', 'FitB', 'FitBH', 'FitBV']);
// All a page-only /GoTo action may hold; /Next, which chains another action, is not among them.
const GOTO_KEYS = new Set(['Type', 'S', 'D']);

function isNamed(object: PDFObject | undefined, name: string): boolean {
  return object instanceof PDFName && object.decodeText() === name;
}

// [page /Fit …]: a page reference (or a page index) and how to frame it, with numbers or null after it.
export function isExplicitDestination(value: PDFObject | undefined): boolean {
  if (!(value instanceof PDFArray)) return false;
  const [page, fit, ...frame] = value.asArray();
  const isPage = page instanceof PDFRef || page instanceof PDFNumber;
  const isFit = fit instanceof PDFName && DESTINATION_FITS.has(fit.decodeText());
  return isPage && isFit && frame.every((item) => item instanceof PDFNumber || item === PDFNull);
}

// A destination named in the document's own destination tree.
export function isNamedDestination(value: PDFObject | undefined): boolean {
  return value instanceof PDFString || value instanceof PDFHexString || value instanceof PDFName;
}

function isGoToAction(value: PDFObject | undefined, lookup: Lookup): boolean {
  if (!(value instanceof PDFDict)) return false;
  if (!value.keys().every((key) => GOTO_KEYS.has(key.decodeText()))) return false;
  const type = lookup(value.get(PDFName.of('Type')));
  if (type !== undefined && !isNamed(type, 'Action')) return false;
  if (!isNamed(lookup(value.get(PDFName.of('S'))), 'GoTo')) return false;
  const destination = lookup(value.get(PDFName.of('D')));
  return isExplicitDestination(destination) || isNamedDestination(destination);
}

function pageOnlyKind(value: PDFObject | undefined, lookup: Lookup): OpenActionKind | null {
  if (isExplicitDestination(value)) return 'destination';
  return isGoToAction(value, lookup) ? 'goto' : null;
}

// Removes the catalog's /OpenAction when it only opens a page and says what it was; returns null, removing
// nothing, when there is none or when any part of it does more.
export function removePageOnlyOpenAction(document: PDFDocument): OpenActionKind | null {
  const { catalog } = document;
  const lookup: Lookup = (object) => document.context.lookup(object);
  const entries = catalog.entries().filter(([key]) => nameSpellings(key).includes(OPEN_ACTION));
  const kinds = entries.map(([, value]) => pageOnlyKind(lookup(value), lookup));
  const [kind] = kinds;
  if (kind === undefined || kinds.includes(null)) return null;
  for (const [key] of entries) catalog.delete(key);
  return kind;
}
