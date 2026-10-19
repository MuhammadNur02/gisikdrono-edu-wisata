import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFStream,
  PDFString,
  type PDFObject,
} from 'pdf-lib';

import { BOOKLET_LINK_SCHEMES } from '@/config/uploads';
import { nameSpellings } from '@/lib/uploads/pdf-names';
import { isExplicitDestination, isNamedDestination } from '@/lib/uploads/pdf-open-action';

// What a booklet PDF may hold (docs/Security.md §8.4, UPL-05; security review of PR #14, M1). Two layers walk every
// object. The allowlist: an action, wherever an /A or /PA points, is only /GoTo to a destination or /URI, with no
// other key (so no /Next chain); an annotation is only /Link, or a comment the copy leaves out (./pdf-annotations.ts).
// The names below are refused as a key or a value in every spelling, whatever they sit in, so an embedded file
// without /Type, a 3D script or an action hidden where no allowlist looks still refuses the file.

export type Finding = { problem: 'pdf_active_content' | 'pdf_link'; detail: string };

// Resolves a reference to the object it points at (pdf-lib's context.lookup).
export type Lookup = (object: PDFObject | undefined) => PDFObject | undefined;

const FORBIDDEN_NAMES = new Set([
  'OpenAction',
  'AA',
  'JavaScript',
  'JS',
  'Launch',
  // Files carried inside or beside the PDF, with or without /Type /EmbeddedFile.
  'EmbeddedFile',
  'EmbeddedFiles',
  'EF',
  'AF',
  'RF',
  'FS',
  'FileAttachment',
  // Media, 3D and forms.
  '3D',
  '3DD',
  'RichMedia',
  'Sound',
  'Movie',
  'Screen',
  'Rendition',
  'XFA',
  // Actions and structures that reach other files or send data; article threads are refused with them.
  'Thread',
  'GoToR',
  'GoToE',
  'SubmitForm',
  'ImportData',
]);

// Comments and their popups: allowed in the scan because the copy leaves them out.
export const MARKUP_ANNOTATIONS = new Set([
  'Text',
  'FreeText',
  'Line',
  'Square',
  'Circle',
  'Polygon',
  'PolyLine',
  'Highlight',
  'Underline',
  'Squiggly',
  'StrikeOut',
  'Caret',
  'Stamp',
  'Ink',
  'Popup',
]);

const URI_KEY = 'URI';
const ACTION_KEYS = new Set(['A', 'PA']);
const ACTION_KEYS_BY_TYPE: Record<string, ReadonlySet<string> | undefined> = {
  GoTo: new Set(['Type', 'S', 'D']),
  URI: new Set(['Type', 'S', 'URI', 'IsMap']),
};

function forbiddenName(name: PDFName): string | undefined {
  return nameSpellings(name).find((spelling) => FORBIDDEN_NAMES.has(spelling));
}

function exactName(object: PDFObject | undefined): string | null {
  return object instanceof PDFName ? object.decodeText() : null;
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

// Exact spellings only: an escaped /S or key a reader would decode differently is not on the allowlist.
function actionProblem(value: PDFObject | undefined, lookup: Lookup): Finding | null {
  const kind = value instanceof PDFDict ? exactName(value.get(PDFName.of('S'))) : null;
  const allowedKeys = kind === null ? undefined : ACTION_KEYS_BY_TYPE[kind];
  const isAllowed =
    value instanceof PDFDict &&
    allowedKeys !== undefined &&
    value.keys().every((key) => allowedKeys.has(key.decodeText()));
  if (!isAllowed) return { problem: 'pdf_active_content', detail: `action:${kind ?? 'unknown'}` };
  if (kind !== 'GoTo') return null;
  const destination = lookup(value.get(PDFName.of('D')));
  const isDestination = isExplicitDestination(destination) || isNamedDestination(destination);
  return isDestination ? null : { problem: 'pdf_active_content', detail: 'action:GoTo' };
}

// /Type is optional on an annotation, so one is known by /Type /Annot or by a /Subtype next to its /Rect
// (security review of PR #14, N1).
export function isAnnotationLike(dict: PDFDict): boolean {
  if (exactName(dict.get(PDFName.of('Type'))) === 'Annot') return true;
  return dict.has(PDFName.of('Rect')) && dict.get(PDFName.of('Subtype')) instanceof PDFName;
}

function annotationProblem(dict: PDFDict): Finding | null {
  if (!isAnnotationLike(dict)) return null;
  const subtype = exactName(dict.get(PDFName.of('Subtype')));
  const isAllowed = subtype === 'Link' || (subtype !== null && MARKUP_ANNOTATIONS.has(subtype));
  return isAllowed
    ? null
    : { problem: 'pdf_active_content', detail: `annotation:${subtype ?? 'unknown'}` };
}

function entryProblem(key: PDFName, value: PDFObject, lookup: Lookup): Finding | null {
  const forbidden = forbiddenName(key);
  if (forbidden) return { problem: 'pdf_active_content', detail: forbidden };
  const spellings = nameSpellings(key);
  // A /URI value may sit in an object of its own, so it is looked up and cannot hide behind a reference.
  if (spellings.includes(URI_KEY)) return linkSchemeProblem(lookup(value));
  if (spellings.some((spelling) => ACTION_KEYS.has(spelling))) {
    return actionProblem(lookup(value), lookup) ?? findIn(value, lookup);
  }
  return findIn(value, lookup);
}

function findInDict(dict: PDFDict, lookup: Lookup): Finding | null {
  const annotation = annotationProblem(dict);
  if (annotation) return annotation;
  for (const [key, value] of dict.entries()) {
    const finding = entryProblem(key, value, lookup);
    if (finding) return finding;
  }
  return null;
}

// References are not followed here: every indirect object is walked on its own.
function findIn(object: PDFObject, lookup: Lookup): Finding | null {
  if (object instanceof PDFName) {
    const name = forbiddenName(object);
    return name ? { problem: 'pdf_active_content', detail: name } : null;
  }
  if (object instanceof PDFStream) return findInDict(object.dict, lookup);
  if (object instanceof PDFArray) return firstFinding(object.asArray(), lookup);
  if (object instanceof PDFDict) return findInDict(object, lookup);
  return null;
}

export function firstFinding(objects: PDFObject[], lookup: Lookup): Finding | null {
  for (const object of objects) {
    const finding = findIn(object, lookup);
    if (finding) return finding;
  }
  return null;
}
