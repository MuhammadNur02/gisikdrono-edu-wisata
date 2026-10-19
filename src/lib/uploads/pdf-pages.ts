import { PDFArray, PDFDict, PDFName, PDFRef, type PDFDocument, type PDFObject } from 'pdf-lib';

import { MAX_BOOKLET_PAGES } from '@/config/uploads';

// The pages of a booklet PDF, read without pdf-lib's own page count (security review of PR #14, L3): pdf-lib walks
// /Kids without remembering where it has been, so a node listed twice makes the count exponential and a 1.5 KB file
// can hold the function for a minute. This walk visits every node once, in page order, and refuses a node met
// twice, a kid that is not a reference, anything but /Pages and /Page nodes, and more than 100 pages.

export type PageTree =
  | { ok: true; pages: PDFDict[] }
  | { ok: false; problem: 'unreadable' | 'pdf_too_many_pages'; detail: string };

function typeOf(node: PDFDict): string | null {
  const type = node.get(PDFName.of('Type'));
  return type instanceof PDFName ? type.decodeText() : null;
}

// The kids of a /Pages node, all of them references, or null for anything else.
function kidsOf(node: PDFDict, lookup: (object: PDFObject | undefined) => PDFObject | undefined) {
  const kids = lookup(node.get(PDFName.of('Kids')));
  if (!(kids instanceof PDFArray)) return null;
  const refs = kids.asArray();
  return refs.every((kid) => kid instanceof PDFRef) ? refs : null;
}

const unreadable = (detail: string): PageTree => ({ ok: false, problem: 'unreadable', detail });
const tooMany: PageTree = { ok: false, problem: 'pdf_too_many_pages', detail: 'more than 100' };

// A /Page node, the kids of a /Pages node, or null for anything else in the tree.
function nodeOf(
  node: PDFObject | undefined,
  lookup: (object: PDFObject | undefined) => PDFObject | undefined,
): { page: PDFDict } | { kids: PDFObject[] } | null {
  if (!(node instanceof PDFDict)) return null;
  if (typeOf(node) === 'Page') return { page: node };
  const kids = typeOf(node) === 'Pages' ? kidsOf(node, lookup) : null;
  return kids ? { kids } : null;
}

export function readPageTree(document: PDFDocument): PageTree {
  const lookup = (object: PDFObject | undefined) => document.context.lookup(object);
  const seen = new Set<string>();
  const pages: PDFDict[] = [];
  const pending: (PDFObject | undefined)[] = [document.catalog.get(PDFName.of('Pages'))];
  while (pending.length > 0) {
    const next = pending.pop();
    if (!(next instanceof PDFRef)) return unreadable('page-tree');
    if (seen.has(next.tag)) return unreadable('page-tree-node-twice');
    seen.add(next.tag);
    const node = nodeOf(lookup(next), lookup);
    if (!node) return unreadable('page-tree');
    if ('page' in node) pages.push(node.page);
    // A tree of at most 100 pages never needs more nodes waiting, so a node with too many kids is refused before
    // they are stacked.
    else if (pending.length + node.kids.length > MAX_BOOKLET_PAGES) return tooMany;
    // Last kid first on the stack, so the pages come out in order.
    else pending.push(...[...node.kids].reverse());
    if (pages.length > MAX_BOOKLET_PAGES) return tooMany;
  }
  return pages.length === 0 ? unreadable('no-pages') : { ok: true, pages };
}
