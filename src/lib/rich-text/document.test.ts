import { describe, expect, it } from 'vitest';

import { isAllowedArticleLink, isPublicMediaImagePath, sanitiseRichText } from './document';
import { CANARY, xssCanaryArticle } from '../../../tests/fixtures/xss-canary-article';

function doc(...content: unknown[]) {
  return { type: 'doc', content };
}

function text(value: string, marks: unknown[] = []) {
  return { type: 'text', text: value, marks };
}

describe('sanitiseRichText', () => {
  it('keeps the nodes and marks an article may hold', () => {
    const blocks = sanitiseRichText(
      doc(
        { type: 'heading', attrs: { level: 3 }, content: [text('Jadwal')] },
        {
          type: 'paragraph',
          content: [
            text('Datang ', [{ type: 'bold' }]),
            { type: 'hardBreak' },
            text('pagi', [
              { type: 'italic' },
              { type: 'link', attrs: { href: 'mailto:info@example.test' } },
            ]),
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [text('Pilah')] }] },
          ],
        },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [text('Kutipan')] }] },
      ),
    );

    expect(blocks).toEqual([
      { type: 'heading', level: 3, content: [{ type: 'text', text: 'Jadwal', marks: [] }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Datang ', marks: [{ type: 'bold' }] },
          { type: 'hardBreak' },
          {
            type: 'text',
            text: 'pagi',
            marks: [{ type: 'italic' }, { type: 'link', href: 'mailto:info@example.test' }],
          },
        ],
      },
      {
        type: 'orderedList',
        start: 3,
        items: [[{ type: 'paragraph', content: [{ type: 'text', text: 'Pilah', marks: [] }] }]],
      },
      {
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kutipan', marks: [] }] }],
      },
    ]);
  });

  it('drops unknown nodes with everything inside them, and unknown marks', () => {
    const blocks = sanitiseRichText(
      doc(
        { type: 'iframe', attrs: { src: 'https://evil.example' } },
        { type: 'table', content: [{ type: 'paragraph', content: [text('hidden')] }] },
        {
          type: 'paragraph',
          content: [text('tetap', [{ type: 'textStyle', attrs: { color: 'red' } }])],
        },
      ),
    );

    expect(blocks).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'tetap', marks: [] }] },
    ]);
  });

  it('drops javascript:, data: and relative links but keeps their text', () => {
    const blocks = sanitiseRichText(
      doc({
        type: 'paragraph',
        content: [
          'javascript:alert(1)',
          'JAVASCRIPT:alert(1)',
          'data:text/html,x',
          '/dashboard',
        ].map((href) => text(href, [{ type: 'link', attrs: { href } }])),
      }),
    );

    expect(JSON.stringify(blocks)).not.toContain('"link"');
  });

  it('brings heading levels into 2 to 4', () => {
    const levels = [1, 2, 4, 6, 'x'].map((level) => {
      const [block] = sanitiseRichText(doc({ type: 'heading', attrs: { level }, content: [] }));
      return block?.type === 'heading' ? block.level : null;
    });

    expect(levels).toEqual([2, 2, 4, 4, 2]);
  });

  it('keeps an image from public-media with its alt text, caption and size, and nothing else', () => {
    const [image] = sanitiseRichText(doc(xssCanaryArticle.content[6]));

    expect(image).toEqual({
      type: 'image',
      path: 'rw-05/articles/6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab/0199f5a0-0000-7000-8000-000000000000.webp',
      alt: 'Warga memilah sampah plastik di Bank Sampah',
      caption: 'Pemilahan sampah di Bank Sampah RW 05',
      width: 1600,
      height: 1200,
    });
  });

  it('drops an image without alt text or caption, or with a size it could not have', () => {
    const path = 'rw-08/articles/a/b.webp';
    const blocks = sanitiseRichText(
      doc(
        { type: 'image', attrs: { src: path, alt: '', title: 'Tari' } },
        { type: 'image', attrs: { src: path, alt: 'Penari sanggar', title: '' } },
        { type: 'image', attrs: { src: path, alt: 'Penari sanggar', title: 'Tari', width: 99999 } },
      ),
    );

    expect(blocks).toEqual([
      { type: 'image', path, alt: 'Penari sanggar', caption: 'Tari', width: null, height: null },
    ]);
  });

  it('stops at a nesting depth no article needs', () => {
    let node: Record<string, unknown> = { type: 'paragraph', content: [text('deep')] };
    for (let level = 0; level < 20; level += 1) node = { type: 'blockquote', content: [node] };

    expect(JSON.stringify(sanitiseRichText(doc(node)))).not.toContain('deep');
  });

  it('returns nothing for anything that is not a document', () => {
    expect(sanitiseRichText(null)).toEqual([]);
    expect(sanitiseRichText('<p>hi</p>')).toEqual([]);
    expect(sanitiseRichText({ type: 'paragraph', content: [] })).toEqual([]);
  });

  it('turns the XSS canary article into its legitimate content, the script kept as text', () => {
    const blocks = sanitiseRichText(xssCanaryArticle);
    const [, paragraph] = blocks;
    const inlines = paragraph?.type === 'paragraph' ? paragraph.content : [];
    const links = inlines.flatMap((inline) =>
      inline.type === 'text' ? inline.marks.filter((mark) => mark.type === 'link') : [],
    );

    expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'image']);
    expect(links).toEqual([{ type: 'link', href: 'https://gisikdrono.example/jadwal' }]);
    expect(inlines[0]).toEqual({
      type: 'text',
      text: `<script>alert('${CANARY}')</script>`,
      marks: [],
    });
    expect(blocks[2]).toMatchObject({
      path: expect.stringMatching(/^rw-05\/articles\//) as unknown,
    });
  });
});

describe('isAllowedArticleLink', () => {
  it('allows https, http and mailto, without credentials', () => {
    expect(isAllowedArticleLink('https://wa.me/6281200000000')).toBe(true);
    expect(isAllowedArticleLink('http://example.test')).toBe(true);
    expect(isAllowedArticleLink('mailto:info@example.test')).toBe(true);
    expect(isAllowedArticleLink('https://user:pass@example.test')).toBe(false);
    expect(isAllowedArticleLink('tel:+6281200000000')).toBe(false);
  });
});

describe('isPublicMediaImagePath', () => {
  it('accepts only the WebP paths finalize writes', () => {
    expect(isPublicMediaImagePath('kelurahan/hero/0199f5a0-0000-7000-8000-000000000000.webp')).toBe(
      true,
    );
    expect(isPublicMediaImagePath('/rw-05/gallery/a.webp')).toBe(false);
    expect(isPublicMediaImagePath('rw-05/../documents/a.webp')).toBe(false);
    expect(isPublicMediaImagePath('rw-13/gallery/a.webp')).toBe(true);
    expect(isPublicMediaImagePath('rw-00/gallery/a.webp')).toBe(false);
    expect(isPublicMediaImagePath('rw-100/gallery/a.webp')).toBe(false);
    expect(isPublicMediaImagePath('rw-05/gallery/a.png')).toBe(false);
    expect(isPublicMediaImagePath('https://evil.example/rw-05/a.webp')).toBe(false);
  });
});
