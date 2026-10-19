// The XSS canary article (Task P2.9.03, docs/Security.md APP-03, APP-11): an articles.body_json that tries every
// way a stored document could turn into script, next to the legitimate content it hides among. The renderer
// must show the canary strings as plain text and drop everything else that is not on its allowlist. The
// security smoke test of P5 publishes the same document on staging and checks the page.

export const CANARY = 'gsk-xss-canary';

export const xssCanaryArticle = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Bank Sampah RW 05' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: `<script>alert('${CANARY}')</script>` },
        { type: 'text', text: ' <img src=x onerror=alert(1)>', marks: [{ type: 'bold' }] },
        {
          type: 'text',
          text: 'tautan javascript',
          marks: [{ type: 'link', attrs: { href: `javascript:alert('${CANARY}')` } }],
        },
        {
          type: 'text',
          text: 'tautan data',
          marks: [{ type: 'link', attrs: { href: 'data:text/html,<script>alert(1)</script>' } }],
        },
        {
          type: 'text',
          text: 'tautan tab',
          marks: [{ type: 'link', attrs: { href: 'java\tscript:alert(1)' } }],
        },
        {
          type: 'text',
          text: 'jadwal',
          marks: [
            { type: 'link', attrs: { href: 'https://gisikdrono.example/jadwal', target: '_top' } },
            { type: 'textStyle', attrs: { style: 'background:url(javascript:alert(1))' } },
          ],
        },
      ],
    },
    {
      type: 'html',
      content: [{ type: 'text', text: `<iframe src="https://evil.example/${CANARY}">` }],
    },
    { type: 'codeBlock', content: [{ type: 'text', text: 'document.cookie' }] },
    {
      type: 'image',
      attrs: { src: 'https://evil.example/pixel.webp', alt: 'Pelacak dari luar', title: 'Pelacak' },
    },
    {
      type: 'image',
      attrs: {
        src: 'rw-05/articles/../../documents/bookings/x.webp',
        alt: 'Jalan keluar',
        title: 'Jalan keluar',
      },
    },
    {
      type: 'image',
      attrs: {
        src: 'rw-05/articles/6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab/0199f5a0-0000-7000-8000-000000000000.webp',
        alt: 'Warga memilah sampah plastik di Bank Sampah',
        title: 'Pemilahan sampah di Bank Sampah RW 05',
        width: 1600,
        height: 1200,
        onerror: 'alert(1)',
      },
    },
  ],
};
