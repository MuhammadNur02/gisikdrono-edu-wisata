import type { RichTextBlock, RichTextInline } from '@/lib/rich-text/document';

// The contents of an article (DESIGN-SPEC §3.8 "Di artikel ini"): its top-level h2 headings with the anchor each one
// carries, so the contents list and the renderer give the same heading the same id.

export interface OutlineEntry {
  // The block's index among the document's top-level blocks.
  blockIndex: number;
  id: string;
  text: string;
}

const OUTLINE_LEVEL = 2;
// An anchor never starts with a digit or a hyphen, and a heading with no letters falls back to `bagian`.
const FALLBACK_ANCHOR = 'bagian';
const MAX_ANCHOR_LENGTH = 60;

export function inlineText(content: readonly RichTextInline[]): string {
  return content
    .map((inline) => (inline.type === 'text' ? inline.text : ' '))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

// `Taman TOGA Sumber Saras` -> `taman-toga-sumber-saras`.
export function anchorFor(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[-0-9]+|-+$/g, '')
    .slice(0, MAX_ANCHOR_LENGTH)
    .replace(/-+$/, '');
  return slug === '' ? FALLBACK_ANCHOR : slug;
}

// Two headings with the same words get `-2`, `-3` after the first.
export function articleOutline(blocks: readonly RichTextBlock[]): OutlineEntry[] {
  const used = new Map<string, number>();
  return blocks.flatMap((block, blockIndex) => {
    if (block.type !== 'heading' || block.level !== OUTLINE_LEVEL) return [];
    const text = inlineText(block.content);
    if (text === '') return [];
    const base = anchorFor(text);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return [{ blockIndex, id: count === 1 ? base : `${base}-${String(count)}`, text }];
  });
}
