import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAal2, type StaffContext } from '@/server/auth/guards';
import {
  createArticle,
  readArticleOwner,
  removeArticle,
  updateArticle,
} from '@/server/services/article-service';

import { createArticleAction, removeArticleAction, updateArticleAction } from './articles';

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireAal2: vi.fn() }));
vi.mock('@/server/services/article-service', () => ({
  createArticle: vi.fn(),
  readArticleOwner: vi.fn(),
  removeArticle: vi.fn(),
  updateArticle: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const BASE = { userId: 'user-1', isAal2: true, totpVerifiedAt: null, claimsVersion: 1 };
const ADMIN_05: StaffContext = { ...BASE, role: 'admin_rw', rwId: 5 };
const SUPERADMIN: StaffContext = { ...BASE, role: 'superadmin', rwId: null };
const ARTICLE_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const ARTICLE = {
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
};

beforeEach(() => {
  cookie.value = undefined;
  vi.mocked(requireAal2).mockReset().mockResolvedValue({ ok: true, ctx: ADMIN_05 });
  for (const mock of [createArticle, updateArticle, removeArticle]) vi.mocked(mock).mockReset();
  vi.mocked(readArticleOwner).mockReset().mockResolvedValue(5);
  vi.mocked(revalidateTag).mockReset();
});

describe('article actions', () => {
  it("files the RW admin's article under their own RW, even with an RW 08 scope cookie", async () => {
    cookie.value = '8';
    await createArticleAction(ARTICLE);
    expect(createArticle).toHaveBeenCalledWith(
      ADMIN_05,
      5,
      expect.objectContaining({ intent: 'review' }),
    );
    expect(revalidateTag).toHaveBeenCalledWith('articles');
  });

  // docs/PRD.md FR-ADMIN-11: the guard half; articles_moderation_guard refuses the same in the database.
  it('refuses an RW admin publishing, new or edited, before anything is looked up', async () => {
    const publish = { ...ARTICLE, intent: 'publish' };
    for (const result of [await createArticleAction(publish), await updateArticleAction(publish)]) {
      expect(result).toMatchObject({ error: { code: 'FORBIDDEN' } });
    }
    expect(readArticleOwner).not.toHaveBeenCalled();
    expect(createArticle).not.toHaveBeenCalled();
    expect(updateArticle).not.toHaveBeenCalled();
  });

  it('lets the superadmin publish', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    vi.mocked(readArticleOwner).mockResolvedValue(8);
    await updateArticleAction({ ...ARTICLE, intent: 'publish' });
    expect(updateArticle).toHaveBeenCalledWith(8, expect.objectContaining({ intent: 'publish' }));
  });

  // The guard half of the cross-RW proof (the RLS half: supabase/tests/rls_content_writes.sql).
  it('refuses an RW 05 admin an article the database holds for RW 08 or for the kelurahan', async () => {
    for (const owner of [8, null] as const) {
      vi.mocked(readArticleOwner).mockResolvedValue(owner);
      expect(await updateArticleAction(ARTICLE)).toMatchObject({ error: { code: 'FORBIDDEN' } });
    }
    expect(updateArticle).not.toHaveBeenCalled();
  });

  it('leaves removing to the superadmin', async () => {
    expect(await removeArticleAction({ id: ARTICLE_ID })).toMatchObject({
      error: { code: 'FORBIDDEN', message: 'Hanya superadmin yang bisa menghapus artikel.' },
    });
    expect(removeArticle).not.toHaveBeenCalled();
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    await removeArticleAction({ id: ARTICLE_ID });
    expect(removeArticle).toHaveBeenCalledWith(SUPERADMIN, 5, ARTICLE_ID);
  });

  it('refuses a form that names the status or the owner', async () => {
    for (const extra of [{ status: 'published' }, { rwId: 8 }]) {
      expect(await createArticleAction({ ...ARTICLE, ...extra })).toMatchObject({
        error: { code: 'VALIDATION' },
      });
    }
    expect(createArticle).not.toHaveBeenCalled();
  });
});
