import { PDFArray, PDFDict, PDFName, type PDFDocument, type PDFObject } from 'pdf-lib';

import { MARKUP_ANNOTATIONS } from '@/lib/uploads/pdf-rules';

// The annotations a booklet page may carry (security review of PR #14, M1 and L4). Only /Link stays; its action is
// held to /GoTo or /URI by the scan. Comments and their popups (sticky notes, highlights, stamps) carry reviewers'
// names and remarks, so the published copy leaves them out. Anything else, an attachment, sound, movie, screen,
// 3D, rich media, form field or a type this list does not know, refuses the file.

export type AnnotationSort =
  { ok: true; removed: number } | { ok: false; problem: 'pdf_active_content'; detail: string };

type Verdict = 'keep' | 'remove' | { refuse: string };

function verdictOf(annotation: PDFObject | undefined): Verdict {
  const subtype = annotation instanceof PDFDict ? annotation.get(PDFName.of('Subtype')) : undefined;
  const name = subtype instanceof PDFName ? subtype.decodeText() : 'unknown';
  if (name === 'Link') return 'keep';
  return MARKUP_ANNOTATIONS.has(name) ? 'remove' : { refuse: `annotation:${name}` };
}

// Keeps the page's /Link annotations and drops its comments, or names the annotation that refuses the file.
function sortPage(document: PDFDocument, page: PDFDict): { removed: number } | { refuse: string } {
  const annots = document.context.lookup(page.get(PDFName.of('Annots')));
  if (annots === undefined) return { removed: 0 };
  if (!(annots instanceof PDFArray)) return { refuse: 'annotation:not-an-array' };
  const kept: PDFObject[] = [];
  for (const entry of annots.asArray()) {
    const verdict = verdictOf(document.context.lookup(entry));
    if (typeof verdict === 'object') return verdict;
    if (verdict === 'keep') kept.push(entry);
  }
  if (kept.length > 0) page.set(PDFName.of('Annots'), document.context.obj(kept));
  else page.delete(PDFName.of('Annots'));
  return { removed: annots.size() - kept.length };
}

// The removed annotations are left without a reference and go with the other orphans (./pdf-metadata.ts).
export function sortPageAnnotations(document: PDFDocument, pages: PDFDict[]): AnnotationSort {
  let removed = 0;
  for (const page of pages) {
    const result = sortPage(document, page);
    if ('refuse' in result)
      return { ok: false, problem: 'pdf_active_content', detail: result.refuse };
    removed += result.removed;
  }
  return { ok: true, removed };
}
