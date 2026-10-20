import { describe, expect, it } from 'vitest';

import { CMS_LIMITS } from '@/config/cms';

import { saveArticleSchema } from './article';
import { xssCanaryArticle } from '../../../tests/fixtures/xss-canary-article';

const ARTICLE_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const BODY = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bank sampah buka Minggu.' }] }],
};
const ARTICLE = {
  id: ARTICLE_ID,
  title: 'Bank sampah buka setiap Minggu',
  slug: 'bank-sampah-buka-setiap-minggu',
  excerpt: '',
  category: 'news',
  tags: 'kompos, bank sampah, ',
  coverPath: null,
  bodyJson: BODY,
  seoTitle: '',
  seoDescription: '',
  intent: 'review',
};

// A list nested as deep as asked, the way a doctored document would come in.
function nestedDocument(depth: number): unknown {
  let node: unknown = { type: 'paragraph', content: [] };
  for (let level = 0; level < depth; level += 1) node = { type: 'blockquote', content: [node] };
  return { type: 'doc', content: [node] };
}

describe('saveArticleSchema', () => {
  it('takes an article, turns the tag line into a list and parses its own output again', () => {
    const once = saveArticleSchema.parse(ARTICLE);
    expect(once.tags).toEqual(['kompos', 'bank sampah']);
    expect(once.excerpt).toBeNull();
    expect(saveArticleSchema.parse(once)).toEqual(once);
  });

  // The renderer drops what is not on its allowlist; the schema keeps the body as written (APP-11).
  it('keeps the XSS canary as JSON for the allowlist renderer to read', () => {
    expect(saveArticleSchema.safeParse({ ...ARTICLE, bodyJson: xssCanaryArticle }).success).toBe(
      true,
    );
  });

  it.each([
    ['a body that is not a document', { bodyJson: '<script>alert(1)</script>' }],
    ['a body that is a list', { bodyJson: [BODY] }],
    ['a body nested past the limit', { bodyJson: nestedDocument(5_000) }],
    [
      'a body past the size limit',
      {
        bodyJson: {
          type: 'doc',
          content: [{ type: 'text', text: 'a'.repeat(CMS_LIMITS.articleBodyBytes) }],
        },
      },
    ],
    ['more than ten tags', { tags: Array.from({ length: 11 }, (_, i) => `tag${String(i)}`) }],
    ['a slug with a slash', { slug: 'rw-05/berita' }],
    ['an unknown intent', { intent: 'archive' }],
  ])('refuses %s', (_case, change) => {
    expect(saveArticleSchema.safeParse({ ...ARTICLE, ...change }).success).toBe(false);
  });

  // The owner, the status, the author and the reviewer are the server's to decide.
  it.each([
    ['rwId', 8],
    ['status', 'published'],
    ['authorId', ARTICLE_ID],
    ['reviewedBy', ARTICLE_ID],
    ['publishedAt', '2026-10-20T00:00:00Z'],
    ['readingMinutes', 1],
  ])('refuses a form that names %s', (field, value) => {
    expect(saveArticleSchema.safeParse({ ...ARTICLE, [field]: value }).success).toBe(false);
  });
});
