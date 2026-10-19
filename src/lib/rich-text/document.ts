import {
  ARTICLE_HEADING_LEVELS,
  ARTICLE_LINK_SCHEMES,
  ARTICLE_MAX_DEPTH,
  type ArticleHeadingLevel,
} from '@/config/rich-text';
import { ALT_TEXT_MAX_LENGTH, ALT_TEXT_MIN_LENGTH, MAX_IMAGE_EDGE_PX } from '@/config/uploads';
import { MEDIA_OWNERS } from '@/lib/uploads/paths';

// The allowlist between articles.body_json and the page (CLAUDE.md §7.8, docs/Security.md APP-03, APP-11). The
// stored document is Tiptap's ProseMirror JSON, written by staff but read here as untrusted input: only the
// nodes and marks below survive, each with only the attributes it needs, already checked. An unknown node is
// dropped with everything inside it, an unknown mark leaves its text plain, a link outside https, http or
// mailto loses its link, and an image is kept only from public-media with its alt text and caption. Nothing
// here ever becomes raw HTML: the renderer builds React elements from this shape.

export type RichTextMark = { type: 'bold' } | { type: 'italic' } | { type: 'link'; href: string };

export type RichTextInline =
  { type: 'text'; text: string; marks: RichTextMark[] } | { type: 'hardBreak' };

export interface RichTextImage {
  type: 'image';
  path: string;
  alt: string;
  caption: string;
  width: number | null;
  height: number | null;
}

export type RichTextBlock =
  | { type: 'paragraph'; content: RichTextInline[] }
  | { type: 'heading'; level: ArticleHeadingLevel; content: RichTextInline[] }
  | { type: 'bulletList'; items: RichTextBlock[][] }
  | { type: 'orderedList'; start: number; items: RichTextBlock[][] }
  | { type: 'blockquote'; content: RichTextBlock[] }
  | RichTextImage;

type JsonNode = Record<string, unknown>;

const SAFE_SEGMENT = '/[a-z0-9][a-z0-9-]*';
// `<owner>/…/<name>.webp`, the paths finalize writes; no scheme, no leading slash, no `..`.
const PUBLIC_MEDIA_IMAGE = new RegExp(`^(?:${MEDIA_OWNERS.join('|')})(?:${SAFE_SEGMENT})+\\.webp$`);

function isNode(value: unknown): value is JsonNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function childrenOf(node: JsonNode): JsonNode[] {
  return Array.isArray(node.content) ? node.content.filter(isNode) : [];
}

function attributesOf(node: JsonNode): JsonNode {
  return isNode(node.attrs) ? node.attrs : {};
}

function stringAttribute(node: JsonNode, name: string): string | null {
  const value = attributesOf(node)[name];
  return typeof value === 'string' ? value.trim() : null;
}

export function isAllowedArticleLink(href: string): boolean {
  try {
    const url = new URL(href);
    return ARTICLE_LINK_SCHEMES.includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isPublicMediaImagePath(path: string): boolean {
  return PUBLIC_MEDIA_IMAGE.test(path);
}

function markOf(mark: JsonNode): RichTextMark | null {
  if (mark.type === 'bold' || mark.type === 'italic') return { type: mark.type };
  const href = mark.type === 'link' ? stringAttribute(mark, 'href') : null;
  return href !== null && isAllowedArticleLink(href) ? { type: 'link', href } : null;
}

// Each kind of mark once, so a doctored document cannot nest a link inside a link.
function marksOf(node: JsonNode): RichTextMark[] {
  const marks = (Array.isArray(node.marks) ? node.marks.filter(isNode) : [])
    .map(markOf)
    .filter((mark): mark is RichTextMark => mark !== null);
  return marks.filter(
    (mark, index) => marks.findIndex((other) => other.type === mark.type) === index,
  );
}

function inlineOf(node: JsonNode): RichTextInline | null {
  if (node.type === 'hardBreak') return { type: 'hardBreak' };
  if (node.type !== 'text' || typeof node.text !== 'string') return null;
  return { type: 'text', text: node.text, marks: marksOf(node) };
}

function inlinesOf(node: JsonNode): RichTextInline[] {
  return childrenOf(node)
    .map(inlineOf)
    .filter((inline): inline is RichTextInline => inline !== null);
}

function headingLevelOf(node: JsonNode): ArticleHeadingLevel {
  const level = attributesOf(node).level;
  const highest = ARTICLE_HEADING_LEVELS[0];
  const lowest = ARTICLE_HEADING_LEVELS[ARTICLE_HEADING_LEVELS.length - 1] ?? highest;
  if (typeof level !== 'number' || level <= highest) return highest;
  return ARTICLE_HEADING_LEVELS.find((allowed) => allowed === level) ?? lowest;
}

function dimensionOf(node: JsonNode, name: string): number | null {
  const value = attributesOf(node)[name];
  const isPixelSize =
    Number.isInteger(value) && Number(value) > 0 && Number(value) <= MAX_IMAGE_EDGE_PX;
  return isPixelSize ? Number(value) : null;
}

function imageOf(node: JsonNode): RichTextImage | null {
  const path = stringAttribute(node, 'src');
  const alt = stringAttribute(node, 'alt');
  const caption = stringAttribute(node, 'title');
  if (path === null || !isPublicMediaImagePath(path) || !caption) return null;
  if (alt === null || alt.length < ALT_TEXT_MIN_LENGTH || alt.length > ALT_TEXT_MAX_LENGTH)
    return null;
  return {
    type: 'image',
    path,
    alt,
    caption,
    width: dimensionOf(node, 'width'),
    height: dimensionOf(node, 'height'),
  };
}

function startOf(node: JsonNode): number {
  const start = attributesOf(node).start;
  return Number.isInteger(start) && Number(start) >= 1 ? Number(start) : 1;
}

function listItemsOf(node: JsonNode, depth: number): RichTextBlock[][] {
  return childrenOf(node)
    .filter((child) => child.type === 'listItem')
    .map((item) => blocksOf(item, depth + 1));
}

function blockOf(node: JsonNode, depth: number): RichTextBlock | null {
  switch (node.type) {
    case 'paragraph':
      return { type: 'paragraph', content: inlinesOf(node) };
    case 'heading':
      return { type: 'heading', level: headingLevelOf(node), content: inlinesOf(node) };
    case 'bulletList':
      return { type: 'bulletList', items: listItemsOf(node, depth) };
    case 'orderedList':
      return { type: 'orderedList', start: startOf(node), items: listItemsOf(node, depth) };
    case 'blockquote':
      return { type: 'blockquote', content: blocksOf(node, depth + 1) };
    case 'image':
      return imageOf(node);
    default:
      return null;
  }
}

function blocksOf(node: JsonNode, depth: number): RichTextBlock[] {
  if (depth > ARTICLE_MAX_DEPTH) return [];
  return childrenOf(node)
    .map((child) => blockOf(child, depth))
    .filter((block): block is RichTextBlock => block !== null);
}

export function sanitiseRichText(document: unknown): RichTextBlock[] {
  return isNode(document) && document.type === 'doc' ? blocksOf(document, 0) : [];
}
