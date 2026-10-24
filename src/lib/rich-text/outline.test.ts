import { describe, expect, it } from 'vitest';

import type { RichTextBlock } from '@/lib/rich-text/document';
import { anchorFor, articleOutline, inlineText } from '@/lib/rich-text/outline';

function heading(text: string, level: 2 | 3 = 2): RichTextBlock {
  return { type: 'heading', level, content: [{ type: 'text', text, marks: [] }] };
}

describe('anchorFor', () => {
  it('slugs the words and never starts with a digit', () => {
    expect(anchorFor('Taman TOGA Sumber Saras')).toBe('taman-toga-sumber-saras');
    expect(anchorFor('3 langkah: Café!')).toBe('langkah-cafe');
    expect(anchorFor('123')).toBe('bagian');
  });
});

describe('inlineText', () => {
  it('joins the text and turns a break into a space', () => {
    expect(
      inlineText([
        { type: 'text', text: 'Bank', marks: [] },
        { type: 'hardBreak' },
        { type: 'text', text: 'Sampah', marks: [] },
      ]),
    ).toBe('Bank Sampah');
  });
});

describe('articleOutline', () => {
  it('lists the top-level h2s with unique anchors and their block index', () => {
    const blocks: RichTextBlock[] = [
      { type: 'paragraph', content: [{ type: 'text', text: 'Pembuka', marks: [] }] },
      heading('Bank Sampah'),
      heading('Detail', 3),
      heading('Bank Sampah'),
      heading('   '),
    ];
    expect(articleOutline(blocks)).toEqual([
      { blockIndex: 1, id: 'bank-sampah', text: 'Bank Sampah' },
      { blockIndex: 3, id: 'bank-sampah-2', text: 'Bank Sampah' },
    ]);
  });
});
