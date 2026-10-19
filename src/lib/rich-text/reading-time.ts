import {
  sanitiseRichText,
  type RichTextBlock,
  type RichTextInline,
} from '@/lib/rich-text/document';

// docs/PRD.md FR-PUB-16: an article shows how long it takes to read. articles.reading_minutes wins when the
// editor stored one; otherwise it is estimated from the words the page will actually show, at a calm adult
// reading pace for Indonesian prose.
const WORDS_PER_MINUTE = 200;

function wordsIn(text: string): number {
  return text.split(/\s+/).filter((word) => word !== '').length;
}

function inlineWords(content: RichTextInline[]): number {
  return content.reduce(
    (sum, inline) => sum + (inline.type === 'text' ? wordsIn(inline.text) : 0),
    0,
  );
}

function blockWords(block: RichTextBlock): number {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return inlineWords(block.content);
    case 'bulletList':
    case 'orderedList':
      return block.items.reduce((sum, item) => sum + countWords(item), 0);
    case 'blockquote':
      return countWords(block.content);
    case 'image':
      return wordsIn(block.caption);
  }
}

function countWords(blocks: RichTextBlock[]): number {
  return blocks.reduce((sum, block) => sum + blockWords(block), 0);
}

// At least one minute, so a short notice never reads "0 menit".
export function estimateReadingMinutes(body: unknown): number {
  return Math.max(1, Math.round(countWords(sanitiseRichText(body)) / WORDS_PER_MINUTE));
}
