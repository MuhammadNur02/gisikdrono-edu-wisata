import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RichText } from './rich-text';
import { CANARY, xssCanaryArticle } from '../../../tests/fixtures/xss-canary-article';

// next/image needs the app's loader configuration; a plain img shows which file the renderer asked for.
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => createElement('img', { src, alt }),
}));

function render(body: unknown) {
  return renderToStaticMarkup(createElement(RichText, { body: body as never }));
}

describe('RichText', () => {
  it('draws the article nodes as their HTML elements inside the prose column', () => {
    const html = render({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Jadwal' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Datang', marks: [{ type: 'bold' }, { type: 'italic' }] },
            { type: 'hardBreak' },
            {
              type: 'text',
              text: 'WhatsApp',
              marks: [{ type: 'link', attrs: { href: 'https://wa.me/6281200000000' } }],
            },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pilah' }] }],
            },
          ],
        },
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kutipan' }] }],
        },
      ],
    });

    expect(html).toContain('class="prose max-w-prose prose-slate dark:prose-invert"');
    expect(html).toContain('<h2>Jadwal</h2>');
    expect(html).toContain('<em><strong>Datang</strong></em><br/>');
    expect(html).toContain(
      '<a href="https://wa.me/6281200000000" rel="noopener noreferrer nofollow">WhatsApp</a>',
    );
    expect(html).toContain('<ul><li><p>Pilah</p></li></ul>');
    expect(html).toContain('<blockquote><p>Kutipan</p></blockquote>');
  });

  it('renders the XSS canary article with the script as text and nothing executable', () => {
    const html = render(xssCanaryArticle);

    expect(html).toContain(`&lt;script&gt;alert(&#x27;${CANARY}&#x27;)&lt;/script&gt;`);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toMatch(/<script|<iframe|javascript:|data:text|evil\.example|target=/i);
    // No element carries an event handler; the onerror above is only text between &lt; and &gt;.
    expect(html).not.toMatch(/<[^>]*\son\w+=/i);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain(
      'src="rw-05/articles/6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab/0199f5a0-0000-7000-8000-000000000000.webp"',
    );
    expect(html).toContain(
      '<figcaption class="text-caption text-muted-foreground">Pemilahan sampah di Bank Sampah RW 05</figcaption>',
    );
  });

  it('draws nothing from a body that is not a document', () => {
    expect(render('<p>halo</p>')).toBe(
      '<div class="prose max-w-prose prose-slate dark:prose-invert"></div>',
    );
  });
});
