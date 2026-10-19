import { describe, expect, it } from 'vitest';

import { estimateReadingMinutes } from '@/lib/rich-text/reading-time';

function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function words(count: number): string {
  return Array.from({ length: count }, () => 'kata').join(' ');
}

describe('estimateReadingMinutes', () => {
  it('never says less than a minute', () => {
    expect(estimateReadingMinutes({ type: 'doc', content: [] })).toBe(1);
    expect(estimateReadingMinutes(null)).toBe(1);
  });

  it('counts paragraphs, headings, lists and quotes at 200 words a minute', () => {
    const body = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: words(100) }] },
        paragraph(words(300)),
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [paragraph(words(200))] }],
        },
        { type: 'blockquote', content: [paragraph(words(200))] },
      ],
    };
    expect(estimateReadingMinutes(body)).toBe(4);
  });

  it('skips what the page will not show', () => {
    const body = {
      type: 'doc',
      content: [paragraph(words(200)), { type: 'script', content: [paragraph(words(2000))] }],
    };
    expect(estimateReadingMinutes(body)).toBe(1);
  });
});
