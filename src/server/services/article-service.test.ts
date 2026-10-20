import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { saveArticleSchema } from '@/lib/validations/article';
import type { StaffContext } from '@/server/auth/guards';

import { createArticle, updateArticle } from './article-service';

const session = vi.hoisted(() => ({ client: null as SupabaseClient<Database> | null }));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve(session.client),
}));
vi.mock('@/server/services/upload-service', () => ({ removeRowPhotos: vi.fn() }));

const ADMIN_05: StaffContext = {
  userId: '0192f3a4-0000-7000-8000-000000000005',
  role: 'admin_rw',
  rwId: 5,
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
};
const ARTICLE_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const OWN_PHOTO = `rw-05/articles/${ARTICLE_ID}/0192f3a4-0000-7000-8000-00000000aaaa.webp`;

function articleWith(change: Record<string, unknown>) {
  return saveArticleSchema.parse({
    id: ARTICLE_ID,
    title: 'Bank sampah buka setiap Minggu',
    slug: 'bank-sampah-buka-setiap-minggu',
    excerpt: '',
    category: 'news',
    tags: '',
    coverPath: null,
    bodyJson: { type: 'doc', content: [] },
    seoTitle: '',
    seoDescription: '',
    intent: 'review',
    ...change,
  });
}

function bodyWithImage(src: string) {
  const image = {
    type: 'image',
    attrs: { src, alt: 'Warga memilah sampah', title: 'Bank sampah' },
  };
  return { type: 'doc', content: [{ type: 'blockquote', content: [image] }] };
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {};
}

// A real typed client whose fetch records every write and answers with the row it wrote (as
// src/server/services/document-service.test.ts does).
function sessionClient() {
  const writes: Record<string, unknown>[] = [];
  const fakeFetch: typeof fetch = (_input, init) => {
    const body = recordOf(typeof init?.body === 'string' ? JSON.parse(init.body) : null);
    writes.push(body);
    const row = { id: ARTICLE_ID, rw_id: 5, tags: [], ...body };
    return Promise.resolve(
      new Response(JSON.stringify(row), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
  session.client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  });
  return writes;
}

beforeEach(() => {
  session.client = null;
});

describe('createArticle', () => {
  it('writes the status the intent names, the author, and a reading time', async () => {
    const writes = sessionClient();
    await createArticle(ADMIN_05, 5, articleWith({ coverPath: OWN_PHOTO }));
    expect(writes[0]).toMatchObject({
      id: ARTICLE_ID,
      rw_id: 5,
      author_id: ADMIN_05.userId,
      status: 'pending_review',
      reading_minutes: 1,
      cover_path: OWN_PHOTO,
    });
  });

  // An officer cannot hang another RW's photo, or one of another article, on their own article.
  it.each([
    ['a cover of RW 08', { coverPath: OWN_PHOTO.replace('rw-05', 'rw-08') }],
    ['a body photo of RW 08', { bodyJson: bodyWithImage(OWN_PHOTO.replace('rw-05', 'rw-08')) }],
    [
      'a body photo of another article',
      { bodyJson: bodyWithImage(OWN_PHOTO.replace(ARTICLE_ID, ARTICLE_ID.replace('01', '02'))) },
    ],
    [
      'a gallery photo for a cover',
      { coverPath: `rw-05/gallery/${OWN_PHOTO.split('/').at(-1) ?? ''}` },
    ],
  ])('refuses %s before writing', async (_case, change) => {
    const writes = sessionClient();
    await expect(createArticle(ADMIN_05, 5, articleWith(change))).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(writes).toEqual([]);
  });

  it('takes photos of its own folder in the body', async () => {
    const writes = sessionClient();
    await createArticle(ADMIN_05, 5, articleWith({ bodyJson: bodyWithImage(OWN_PHOTO) }));
    expect(writes).toHaveLength(1);
  });
});

describe('updateArticle', () => {
  it('writes no owner, author or id, only the content and its status', async () => {
    const writes = sessionClient();
    await updateArticle(5, articleWith({ intent: 'draft' }));
    expect(writes[0]).toMatchObject({ status: 'draft' });
    for (const column of ['id', 'rw_id', 'author_id', 'reviewed_by', 'published_at'])
      expect(writes[0]).not.toHaveProperty(column);
  });
});
