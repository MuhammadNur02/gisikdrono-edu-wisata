import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { saveArticleSchema } from '@/lib/validations/article';
import type { StaffContext } from '@/server/auth/guards';
import { keepRowPhotos } from '@/server/services/upload-service';
import type { ArticleAdmin } from '@/types/cms';

import { createArticle, updateArticle } from './article-service';
import { fakeSessionClient, type RecordedWrite } from '../../../tests/fixtures/fake-session-client';

const session = vi.hoisted(() => ({ client: null as SupabaseClient<Database> | null }));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve(session.client),
}));
vi.mock('@/server/services/upload-service', () => ({
  keepRowPhotos: vi.fn(),
  removeRowPhotos: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const ADMIN_05: StaffContext = {
  userId: '0192f3a4-0000-7000-8000-000000000005',
  role: 'admin_rw',
  rwId: 5,
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
};
const SUPERADMIN: StaffContext = { ...ADMIN_05, role: 'superadmin', rwId: null };
const ARTICLE_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const FOLDER = `rw-05/articles/${ARTICLE_ID}`;
const OWN_PHOTO = `${FOLDER}/0192f3a4-0000-7000-8000-00000000aaaa.webp`;
const BODY_PHOTO = `${FOLDER}/0192f3a4-0000-7000-8000-00000000bbbb.webp`;
const TARGET = { rwId: 5, purpose: 'article', entityId: ARTICLE_ID };

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

function stored(status: ArticleAdmin['status']): ArticleAdmin {
  return {
    id: ARTICLE_ID,
    owner: 5,
    slug: 'bank-sampah-buka-setiap-minggu',
    title: 'Bank sampah buka setiap Minggu',
    excerpt: null,
    bodyJson: { type: 'doc', content: [] },
    coverPath: null,
    category: 'news',
    tags: [],
    status,
    seoTitle: null,
    seoDescription: null,
  };
}

function bodyWithImage(src: string) {
  const image = {
    type: 'image',
    attrs: { src, alt: 'Warga memilah sampah', title: 'Bank sampah' },
  };
  return { type: 'doc', content: [{ type: 'blockquote', content: [image] }] };
}

function sessionClient(): RecordedWrite[] {
  const fake = fakeSessionClient({ id: ARTICLE_ID, rw_id: 5, tags: [] });
  session.client = fake.client;
  return fake.writes;
}

beforeEach(() => {
  session.client = null;
  vi.mocked(keepRowPhotos).mockReset().mockResolvedValue(0);
});

describe('createArticle', () => {
  it('writes the status the intent names, the author, and a reading time', async () => {
    const writes = sessionClient();
    await createArticle(ADMIN_05, 5, articleWith({ coverPath: OWN_PHOTO }));
    expect(writes[0]?.body).toMatchObject({
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

  // docs/Security.md R34: what the form uploaded but the article does not show leaves its folder.
  it("keeps only the cover and body photos in the article's folder", async () => {
    sessionClient();
    const values = articleWith({ coverPath: OWN_PHOTO, bodyJson: bodyWithImage(BODY_PHOTO) });
    const result = await createArticle(ADMIN_05, 5, values);
    expect(keepRowPhotos).toHaveBeenCalledWith(ADMIN_05, TARGET, [OWN_PHOTO, BODY_PHOTO]);
    expect(result.filesRemoved).toBe(true);
  });
});

describe('updateArticle', () => {
  it('writes no owner, author or id, only the content and its status', async () => {
    const writes = sessionClient();
    await updateArticle(ADMIN_05, 5, articleWith({ intent: 'draft' }), stored('pending_review'));
    expect(writes[0]?.body).toMatchObject({ status: 'draft' });
    for (const column of ['id', 'rw_id', 'author_id', 'reviewed_by', 'published_at'])
      expect(writes[0]?.body).not.toHaveProperty(column);
  });

  // Finding 1 of the review of PR #18: the database sends the RW admin's change back to review, so the service
  // names no status for a published article, which the guard would refuse.
  it("leaves the status of an RW admin's published article to the review rule", async () => {
    const writes = sessionClient();
    await updateArticle(ADMIN_05, 5, articleWith({ intent: 'review' }), stored('published'));
    expect(writes[0]?.body).not.toHaveProperty('status');
  });

  it("writes the superadmin's choice for a published article", async () => {
    const writes = sessionClient();
    await updateArticle(SUPERADMIN, 5, articleWith({ intent: 'draft' }), stored('published'));
    expect(writes[0]?.body).toMatchObject({ status: 'draft' });
  });

  it('takes a photo out of the body out of its folder too', async () => {
    sessionClient();
    await updateArticle(ADMIN_05, 5, articleWith({ coverPath: OWN_PHOTO }), stored('draft'));
    expect(keepRowPhotos).toHaveBeenCalledWith(ADMIN_05, TARGET, [OWN_PHOTO]);
  });
});
