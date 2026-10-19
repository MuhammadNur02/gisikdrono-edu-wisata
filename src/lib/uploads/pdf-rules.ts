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
import type { ScanDeadline } from '@/lib/uploads/pdf-deadline';
import { nameSpellings } from '@/lib/uploads/pdf-names';
import { isExplicitDestination, isNamedDestination } from '@/lib/uploads/pdf-open-action';

// What a booklet PDF may hold (docs/Security.md §8.4, UPL-05; security review of PR #14, M1). Two layers walk every
// object. The allowlist: an action, wherever an /A or /PA points, is only /GoTo to a destination or /URI, with no
// other key (so no /Next chain); an annotation is only /Link, or a comment the copy leaves out (./pdf-annotations.ts).
// The names below are refused as a key or a value in every spelling, whatever they sit in, so an embedded file
// without /Type, a 3D script or an action hidden where no allowlist looks still refuses the file. A booklet also has
// no use for what a reader keeps out of sight or parses outside the PDF itself: a form field holding a value, a
// signature's permissions, a hidden layer, a JBIG2 or JPEG 2000 image or a PostScript XObject. Those are refused as
// unsupported content (security review of PR #14, F5 and F9).

export type Finding = {
  problem: 'pdf_active_content' | 'pdf_link' | 'pdf_unsupported_content';
  detail: string;
};

// Resolves a reference to the object it points at (pdf-lib's context.lookup).
export type Lookup = (object: PDFObject | undefined) => PDFObject | undefined;

// What a walk carries: the lookup, and the scan's deadline, stepped on every node it visits (review F1).
export type Walk = { lookup: Lookup; deadline: ScanDeadline };

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

// Signature permissions (with the signer's name and certificate), and image codecs viewers parse with libraries of
// their own.
const UNSUPPORTED_NAMES = new Set(['Perms', 'JBIG2Decode', 'JBIG2Globals', 'JPXDecode']);
const FIELD_VALUE_KEYS = ['V', 'DV'];
const FIELD_KEYS = ['FT', 'T', 'Parent', 'Kids'];
const POSTSCRIPT_SUBTYPE = 'PS';
const HIDDEN_LAYER: Finding = { problem: 'pdf_unsupported_content', detail: 'layer:hidden' };

const URI_KEY = 'URI';
const ACTION_KEYS = new Set(['A', 'PA']);
const ACTION_KEYS_BY_TYPE: Record<string, ReadonlySet<string> | undefined> = {
  GoTo: new Set(['Type', 'S', 'D']),
  URI: new Set(['Type', 'S', 'URI', 'IsMap']),
};

function nameFinding(name: PDFName): Finding | null {
  const spellings = nameSpellings(name);
  const forbidden = spellings.find((spelling) => FORBIDDEN_NAMES.has(spelling));
  if (forbidden) return { problem: 'pdf_active_content', detail: forbidden };
  const unsupported = spellings.find((spelling) => UNSUPPORTED_NAMES.has(spelling));
  return unsupported ? { problem: 'pdf_unsupported_content', detail: unsupported } : null;
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
function actionProblem(value: PDFObject | undefined, { lookup }: Walk): Finding | null {
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

// A form field (it has a type, a name, a parent or kids) holding a value or a default value, or a PostScript XObject.
function unsupportedDictProblem(dict: PDFDict): Finding | null {
  const has = (key: string) => dict.has(PDFName.of(key));
  if (FIELD_VALUE_KEYS.some(has) && FIELD_KEYS.some(has)) {
    return { problem: 'pdf_unsupported_content', detail: 'form:value' };
  }
  const subtype = dict.get(PDFName.of('Subtype'));
  const isPostScript =
    subtype instanceof PDFName && nameSpellings(subtype).includes(POSTSCRIPT_SUBTYPE);
  return isPostScript ? { problem: 'pdf_unsupported_content', detail: 'xobject:PS' } : null;
}

function entryProblem(key: PDFName, value: PDFObject, walk: Walk): Finding | null {
  const named = nameFinding(key);
  if (named) return named;
  const spellings = nameSpellings(key);
  // A /URI value may sit in an object of its own, so it is looked up and cannot hide behind a reference.
  if (spellings.includes(URI_KEY)) return linkSchemeProblem(walk.lookup(value));
  if (spellings.some((spelling) => ACTION_KEYS.has(spelling))) {
    return actionProblem(walk.lookup(value), walk) ?? findIn(value, walk);
  }
  return findIn(value, walk);
}

function findInDict(dict: PDFDict, walk: Walk): Finding | null {
  const own = annotationProblem(dict) ?? unsupportedDictProblem(dict);
  if (own) return own;
  for (const [key, value] of dict.entries()) {
    const finding = entryProblem(key, value, walk);
    if (finding) return finding;
  }
  return null;
}

// References are not followed here: every indirect object is walked on its own.
function findIn(object: PDFObject, walk: Walk): Finding | null {
  walk.deadline.step();
  if (object instanceof PDFName) return nameFinding(object);
  if (object instanceof PDFStream) return findInDict(object.dict, walk);
  if (object instanceof PDFArray) return firstFinding(object.asArray(), walk);
  if (object instanceof PDFDict) return findInDict(object, walk);
  return null;
}

export function firstFinding(objects: PDFObject[], walk: Walk): Finding | null {
  for (const object of objects) {
    const finding = findIn(object, walk);
    if (finding) return finding;
  }
  return null;
}

function isEmptyOrMissing(object: PDFObject | undefined): boolean {
  return object === undefined || (object instanceof PDFArray && object.size() === 0);
}

// A layer the document opens hidden keeps its content in the file, out of sight (security review of PR #14, F5). The
// default configuration of /OCProperties may switch no layer off, start from nothing but /ON, and set no layers by
// usage; wherever a reader would start with something hidden, the file is refused.
export function hiddenLayerFinding(catalog: PDFDict, lookup: Lookup): Finding | null {
  const properties = lookup(catalog.get(PDFName.of('OCProperties')));
  if (properties === undefined) return null;
  const defaults =
    properties instanceof PDFDict ? lookup(properties.get(PDFName.of('D'))) : undefined;
  if (!(defaults instanceof PDFDict)) return HIDDEN_LAYER;
  const baseState = lookup(defaults.get(PDFName.of('BaseState')));
  const hidesNothing =
    isEmptyOrMissing(lookup(defaults.get(PDFName.of('OFF')))) &&
    isEmptyOrMissing(lookup(defaults.get(PDFName.of('AS')))) &&
    (baseState === undefined || exactName(baseState) === 'ON');
  return hidesNothing ? null : HIDDEN_LAYER;
}
