import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNull,
  PDFRef,
  PDFStream,
  type PDFDocument,
  type PDFObject,
} from 'pdf-lib';

import type { ScanDeadline } from '@/lib/uploads/pdf-deadline';
import { nameSpellings } from '@/lib/uploads/pdf-names';
import { isAnnotationLike, MARKUP_ANNOTATIONS } from '@/lib/uploads/pdf-rules';

// The annotations a booklet may carry (security review of PR #14, M1, L4 and N1). Only /Link stays; its action is
// held to /GoTo or /URI by the scan. Comments and their popups (sticky notes, highlights, stamps) carry reviewers'
// names and remarks, so the published copy leaves them out whole: the comment objects themselves, wherever they
// sit (a page's /Annots, a link's /Popup, a reply's /IRT, a tagged PDF's structure tree), every reference to them,
// and, through the orphan pass of ./pdf-metadata.ts, whatever only they referred to. Anything else on a page, an
// attachment, sound, movie, screen, 3D, rich media, form field or a type this list does not know, refuses the file.

export type PageAnnotationCheck =
  { ok: true } | { ok: false; problem: 'pdf_active_content'; detail: string };

const OBJECT_REFERENCE_TYPE = 'OBJR';
// Number and name trees pair each key with the value after it, and a page's entry in a structure tree's parent tree is
// an array indexed by marked-content id. Removing an element there would shift what follows onto the wrong key, so
// under these keys a removed reference becomes null instead (security review of PR #14, Info A).
const POSITIONAL_ARRAY_KEYS = new Set(['Nums', 'Names']);

function nameOf(object: PDFObject | undefined): string | null {
  return object instanceof PDFName ? object.decodeText() : null;
}

function subtypeOf(dict: PDFDict): string | null {
  return nameOf(dict.get(PDFName.of('Subtype')));
}

function isComment(object: PDFObject | undefined): object is PDFDict {
  if (!(object instanceof PDFDict)) return false;
  const subtype = subtypeOf(object);
  return subtype !== null && MARKUP_ANNOTATIONS.has(subtype);
}

function pageAnnotations(
  document: PDFDocument,
  page: PDFDict,
): PDFArray | 'missing' | 'not-an-array' {
  const annots = document.context.lookup(page.get(PDFName.of('Annots')));
  if (annots === undefined) return 'missing';
  return annots instanceof PDFArray ? annots : 'not-an-array';
}

// Every annotation on the pages is a /Link or a comment the copy leaves out; anything else names what refuses the file.
export function checkPageAnnotations(document: PDFDocument, pages: PDFDict[]): PageAnnotationCheck {
  for (const page of pages) {
    const annots = pageAnnotations(document, page);
    if (annots === 'missing') continue;
    if (annots === 'not-an-array') {
      return { ok: false, problem: 'pdf_active_content', detail: 'annotation:not-an-array' };
    }
    for (const entry of annots.asArray()) {
      const annotation = document.context.lookup(entry);
      const subtype = annotation instanceof PDFDict ? subtypeOf(annotation) : null;
      if (subtype === 'Link' || isComment(annotation)) continue;
      return {
        ok: false,
        problem: 'pdf_active_content',
        detail: `annotation:${subtype ?? 'unknown'}`,
      };
    }
  }
  return { ok: true };
}

// The comments to delete: those listed on a page, whatever they lack, and every other annotation-like comment in the
// file. A structure-tree reference to one of them (an OBJR) goes with it.
function commentRefs(document: PDFDocument, pages: PDFDict[]): Set<string> {
  const comments = new Set<string>();
  for (const page of pages) {
    const annots = pageAnnotations(document, page);
    if (typeof annots === 'string') continue;
    for (const entry of annots.asArray()) {
      if (entry instanceof PDFRef && isComment(document.context.lookup(entry)))
        comments.add(entry.tag);
    }
  }
  for (const [ref, object] of document.context.enumerateIndirectObjects()) {
    if (object instanceof PDFDict && isAnnotationLike(object) && isComment(object))
      comments.add(ref.tag);
  }
  return comments;
}

function isReferenceTo(object: PDFObject | undefined, deleted: Set<string>): boolean {
  if (
    !(object instanceof PDFDict) ||
    nameOf(object.get(PDFName.of('Type'))) !== OBJECT_REFERENCE_TYPE
  )
    return false;
  const target = object.get(PDFName.of('Obj'));
  return target instanceof PDFRef && deleted.has(target.tag);
}

type Sweep = { deleted: Set<string>; directComments: number; deadline: ScanDeadline };

// True when the object must go from where it sits: a reference to a deleted object, a comment written in place, or a
// structure-tree reference to a deleted comment. What stays is cleaned in place; references are not followed, since
// every indirect object is swept on its own. `keepPositions` holds inside a number or name tree's array.
function isGone(object: PDFObject, sweep: Sweep, keepPositions = false): boolean {
  sweep.deadline.step();
  if (object instanceof PDFRef) return sweep.deleted.has(object.tag);
  if (isComment(object) && isAnnotationLike(object)) {
    sweep.directComments += 1;
    return true;
  }
  if (isReferenceTo(object, sweep.deleted)) return true;
  if (object instanceof PDFStream) sweepDict(object.dict, sweep, keepPositions);
  else if (object instanceof PDFDict) sweepDict(object, sweep, keepPositions);
  else if (object instanceof PDFArray) sweepArray(object, sweep, keepPositions);
  return false;
}

function isPositionalKey(key: PDFName): boolean {
  return nameSpellings(key).some((spelling) => POSITIONAL_ARRAY_KEYS.has(spelling));
}

// Removing a key shifts nothing, so a dictionary always drops it; the arrays below it keep their places when asked.
function sweepDict(dict: PDFDict, sweep: Sweep, keepPositions: boolean): void {
  for (const [key, value] of dict.entries()) {
    if (isGone(value, sweep, keepPositions || isPositionalKey(key))) dict.delete(key);
  }
}

// One pass: what stays moves forward over what goes, then the leftover tail is dropped from its end. Removing each
// gone element where it sat shifted everything after it, which made a long array cost the square of its length
// (security review of PR #14, F4).
function sweepArray(array: PDFArray, sweep: Sweep, keepPositions: boolean): void {
  let kept = 0;
  for (const element of array.asArray()) {
    const isRemoved = isGone(element, sweep, keepPositions);
    if (isRemoved && !keepPositions) continue;
    array.set(kept, isRemoved ? PDFNull : element);
    kept += 1;
  }
  for (let last = array.size() - 1; last >= kept; last -= 1) array.remove(last);
}

// A comment written in place in a page's /Annots goes whatever it lacks; elsewhere only one that looks like an
// annotation does, so a dictionary that merely shares a subtype name is left alone.
function dropDirectPageComments(document: PDFDocument, pages: PDFDict[]): number {
  let dropped = 0;
  for (const page of pages) {
    const annots = pageAnnotations(document, page);
    if (typeof annots === 'string') continue;
    for (let index = annots.size() - 1; index >= 0; index -= 1) {
      if (!isComment(annots.get(index))) continue;
      annots.remove(index);
      dropped += 1;
    }
  }
  return dropped;
}

function dropEmptyAnnots(document: PDFDocument, pages: PDFDict[]): void {
  for (const page of pages) {
    const annots = pageAnnotations(document, page);
    if (annots instanceof PDFArray && annots.size() === 0) page.delete(PDFName.of('Annots'));
  }
}

// Deletes every comment and every reference to one, and answers how many comments went: the number the scan
// reports in upload_sanitized, so the report is what the copy leaves out.
export function removeComments(
  document: PDFDocument,
  pages: PDFDict[],
  deadline: ScanDeadline,
): number {
  const { context } = document;
  const comments = commentRefs(document, pages);
  const deleted = new Set(comments);
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (isReferenceTo(object, comments)) deleted.add(ref.tag);
  }
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (deleted.has(ref.tag)) context.delete(ref);
  }
  const sweep: Sweep = {
    deleted,
    directComments: dropDirectPageComments(document, pages),
    deadline,
  };
  for (const [, object] of context.enumerateIndirectObjects()) isGone(object, sweep);
  dropEmptyAnnots(document, pages);
  return comments.size + sweep.directComments;
}
