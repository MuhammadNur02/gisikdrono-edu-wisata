import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import {
  archiveArticle,
  createArticle,
  readArticleForStaff,
  removeArticle,
  updateArticle,
} from '@/server/services/article-service';
import type { ArticleAdmin } from '@/types/cms';

import {
  archiveArticleAction,
  createArticleAction,
  removeArticleAction,
  updateArticleAction,
} from './articles';

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));

// The RWs of rw_units the RwSwitcher can point at.
vi.mock('@/server/services/rw-unit-service', () => ({
  listRwUnitsForStaff: () => Promise.resolve([{ id: 5 }, { id: 8 }, { id: 13 }]),
}));
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireAal2: vi.fn() }));
vi.mock('@/server/services/article-service', () => ({
  archiveArticle: vi.fn(),
  createArticle: vi.fn(),
  readArticleForStaff: vi.fn(),
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

function stored(change: Partial<ArticleAdmin> = {}): ArticleAdmin {
  return {
    id: ARTICLE_ID,
    owner: 5,
    slug: ARTICLE.slug,
    title: ARTICLE.title,
    excerpt: null,
    bodyJson: { type: 'doc', content: [] },
    coverPath: null,
    category: 'news',
    tags: [],
    status: 'draft',
    seoTitle: null,
    seoDescription: null,
    ...change,
  };
}

const SAVED = { value: stored(), filesRemoved: true };

beforeEach(() => {
  cookie.value = undefined;
  vi.mocked(requireAal2).mockReset().mockResolvedValue({ ok: true, ctx: ADMIN_05 });
  vi.mocked(createArticle).mockReset().mockResolvedValue(SAVED);
  vi.mocked(updateArticle).mockReset().mockResolvedValue(SAVED);
  vi.mocked(removeArticle).mockReset().mockResolvedValue(true);
  vi.mocked(readArticleForStaff).mockReset().mockResolvedValue(stored());
  vi.mocked(archiveArticle).mockReset().mockResolvedValue(undefined);
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
    expect(readArticleForStaff).not.toHaveBeenCalled();
    expect(createArticle).not.toHaveBeenCalled();
    expect(updateArticle).not.toHaveBeenCalled();
  });

  it('lets the superadmin publish', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    const current = stored({ owner: 8 });
    vi.mocked(readArticleForStaff).mockResolvedValue(current);
    await updateArticleAction({ ...ARTICLE, intent: 'publish' });
    expect(updateArticle).toHaveBeenCalledWith(
      SUPERADMIN,
      8,
      expect.objectContaining({ intent: 'publish' }),
      current,
    );
  });

  // Finding 1 of the independent review of PR #18 (decision of 2026-10-21): once published, only the superadmin
  // takes an article off the site or moves its address; the RW admin's changes go through review.
  it('refuses an RW admin taking their published article off the site', async () => {
    vi.mocked(readArticleForStaff).mockResolvedValue(stored({ status: 'published' }));
    expect(await updateArticleAction({ ...ARTICLE, intent: 'draft' })).toMatchObject({
      error: {
        code: 'FORBIDDEN',
        message:
          'Artikel yang sudah tayang hanya bisa ditarik superadmin. Ajukan perubahannya untuk ditinjau, ya.',
      },
    });
    expect(updateArticle).not.toHaveBeenCalled();
  });

  it("refuses an RW admin moving a published article's address", async () => {
    vi.mocked(readArticleForStaff).mockResolvedValue(stored({ status: 'published' }));
    expect(await updateArticleAction({ ...ARTICLE, slug: 'alamat-baru' })).toMatchObject({
      error: {
        code: 'FORBIDDEN',
        message: 'Alamat artikel yang sudah tayang hanya bisa diubah superadmin.',
      },
    });
    expect(updateArticle).not.toHaveBeenCalled();
  });

  it("sends an RW admin's change to a published article for review", async () => {
    const current = stored({ status: 'published' });
    vi.mocked(readArticleForStaff).mockResolvedValue(current);
    await updateArticleAction(ARTICLE);
    expect(updateArticle).toHaveBeenCalledWith(ADMIN_05, 5, expect.anything(), current);
  });

  // The guard half of the cross-RW proof (the RLS half: supabase/tests/rls_content_writes.sql).
  it('refuses an RW 05 admin an article the database holds for RW 08 or for the kelurahan', async () => {
    for (const owner of [8, null] as const) {
      vi.mocked(readArticleForStaff).mockResolvedValue(stored({ owner }));
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

  // docs/Security.md R34: the officer hears when a photo could not be taken out of public-media.
  it('says so when the removed article left a photo behind, after refreshing the site', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    vi.mocked(removeArticle).mockResolvedValue(false);
    expect(await removeArticleAction({ id: ARTICLE_ID })).toMatchObject({
      error: { code: 'INTERNAL', message: copy.cms.common.filesLeft },
    });
    expect(revalidateTag).toHaveBeenCalledWith('articles');
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

describe('archiveArticleAction', () => {
  it("archives an RW admin's own draft by status and revalidates the articles", async () => {
    const result = await archiveArticleAction({ id: ARTICLE_ID });
    expect(result.ok).toBe(true);
    expect(archiveArticle).toHaveBeenCalledWith(5, ARTICLE_ID);
    expect(revalidateTag).toHaveBeenCalledWith('articles');
  });

  it('leaves taking a published article off the site to the superadmin', async () => {
    vi.mocked(readArticleForStaff).mockResolvedValue(stored({ status: 'published' }));
    const result = await archiveArticleAction({ id: ARTICLE_ID });
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(archiveArticle).not.toHaveBeenCalled();
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    expect((await archiveArticleAction({ id: ARTICLE_ID })).ok).toBe(true);
  });

  it("refuses an RW 05 admin another RW's article", async () => {
    vi.mocked(readArticleForStaff).mockResolvedValue(stored({ owner: 8 }));
    const result = await archiveArticleAction({ id: ARTICLE_ID });
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(archiveArticle).not.toHaveBeenCalled();
  });
});

describe('removeArticleAction on a row that is not archived (review of PR #40)', () => {
  it('answers STATE_INVALID with the archive-first copy and revalidates nothing', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    vi.mocked(removeArticle).mockRejectedValueOnce(
      new AppError('STATE_INVALID', 'Arsipkan dulu sebelum menghapus permanen.'),
    );
    const result = await removeArticleAction({ id: ARTICLE_ID });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'STATE_INVALID', message: 'Arsipkan dulu sebelum menghapus permanen.' },
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
