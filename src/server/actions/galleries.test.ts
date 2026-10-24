import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import {
  archiveGalleryItem,
  createGalleryItem,
  readGalleryOwner,
  removeGalleryItem,
  updateGalleryItem,
} from '@/server/services/gallery-service';

import {
  archiveGalleryItemAction,
  createGalleryItemAction,
  removeGalleryItemAction,
  updateGalleryItemAction,
} from './galleries';

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
vi.mock('@/server/services/gallery-service', () => ({
  archiveGalleryItem: vi.fn(),
  createGalleryItem: vi.fn(),
  readGalleryOwner: vi.fn(),
  removeGalleryItem: vi.fn(),
  updateGalleryItem: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const BASE = { userId: 'user-1', isAal2: true, totpVerifiedAt: null, claimsVersion: 1 };
const ADMIN_05: StaffContext = { ...BASE, role: 'admin_rw', rwId: 5 };
const SUPERADMIN: StaffContext = { ...BASE, role: 'superadmin', rwId: null };
const ITEM_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const FIELDS = {
  category: 'activity',
  caption: '',
  altText: 'Warga memilah sampah',
  takenAt: '',
  sortOrder: 0,
  status: 'published',
};
const PHOTO_ITEM = {
  mediaType: 'image',
  image: {
    path: 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp',
    width: 1600,
    height: 1067,
    blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
    thumbnailPath: null,
  },
  videoUrl: '',
  still: null,
  ...FIELDS,
};

beforeEach(() => {
  cookie.value = undefined;
  vi.mocked(requireAal2).mockReset().mockResolvedValue({ ok: true, ctx: ADMIN_05 });
  for (const mock of [createGalleryItem, updateGalleryItem, removeGalleryItem])
    vi.mocked(mock).mockReset();
  vi.mocked(readGalleryOwner).mockReset().mockResolvedValue(5);
  // A removal whose files all went, unless a test says otherwise.
  vi.mocked(removeGalleryItem).mockResolvedValue(true);
  vi.mocked(archiveGalleryItem).mockReset().mockResolvedValue(undefined);
  vi.mocked(revalidateTag).mockReset();
});

describe('gallery actions', () => {
  it("adds the item to the RW admin's own gallery, even with an RW 08 scope cookie", async () => {
    cookie.value = '8';
    await createGalleryItemAction(PHOTO_ITEM);
    expect(createGalleryItem).toHaveBeenCalledWith(
      ADMIN_05,
      5,
      expect.objectContaining({ mediaType: 'image' }),
    );
    expect(revalidateTag).toHaveBeenCalledWith('galleries:5');
  });

  it("files the superadmin's item under Semua as the kelurahan's, with the kelurahan tag", async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    await createGalleryItemAction(PHOTO_ITEM);
    expect(createGalleryItem).toHaveBeenCalledWith(SUPERADMIN, null, expect.anything());
    expect(revalidateTag).toHaveBeenCalledWith('galleries:kelurahan');
  });

  // The guard half of the proof (the RLS half: supabase/tests/rls_content_writes.sql).
  it('refuses an RW 05 admin an item the database holds for RW 08 or for the kelurahan', async () => {
    for (const owner of [8, null] as const) {
      vi.mocked(readGalleryOwner).mockResolvedValue(owner);
      expect(await updateGalleryItemAction({ id: ITEM_ID, ...FIELDS })).toMatchObject({
        error: { code: 'FORBIDDEN' },
      });
      expect(await removeGalleryItemAction({ id: ITEM_ID })).toMatchObject({
        error: { code: 'FORBIDDEN' },
      });
    }
    expect(updateGalleryItem).not.toHaveBeenCalled();
    expect(removeGalleryItem).not.toHaveBeenCalled();
  });

  it('removes an item of their own RW, files included, and refreshes that gallery', async () => {
    await removeGalleryItemAction({ id: ITEM_ID });
    expect(removeGalleryItem).toHaveBeenCalledWith(ADMIN_05, 5, ITEM_ID);
    expect(revalidateTag).toHaveBeenCalledWith('galleries:5');
  });

  it('refuses a form that names the owner or the stored path', async () => {
    expect(await createGalleryItemAction({ ...PHOTO_ITEM, rwId: 8 })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(
      await createGalleryItemAction({ ...PHOTO_ITEM, storagePath: 'rw-08/gallery/x.webp' }),
    ).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(createGalleryItem).not.toHaveBeenCalled();
  });
});

describe('archiveGalleryItemAction', () => {
  it('archives an item of their own RW by status and revalidates its gallery', async () => {
    const result = await archiveGalleryItemAction({ id: ITEM_ID });
    expect(result.ok).toBe(true);
    expect(archiveGalleryItem).toHaveBeenCalledWith(5, ITEM_ID);
    expect(revalidateTag).toHaveBeenCalledWith('galleries:5');
    expect(revalidateTag).toHaveBeenCalledWith('galleries:all');
  });

  it("refuses an RW 05 admin another RW's item", async () => {
    vi.mocked(readGalleryOwner).mockResolvedValue(8);
    const result = await archiveGalleryItemAction({ id: ITEM_ID });
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(archiveGalleryItem).not.toHaveBeenCalled();
  });
});

describe('removeGalleryItemAction on a row that is not archived (review of PR #40)', () => {
  it('answers STATE_INVALID with the archive-first copy and revalidates nothing', async () => {
    vi.mocked(removeGalleryItem).mockRejectedValueOnce(
      new AppError('STATE_INVALID', 'Arsipkan dulu sebelum menghapus permanen.'),
    );
    const result = await removeGalleryItemAction({ id: ITEM_ID });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'STATE_INVALID', message: 'Arsipkan dulu sebelum menghapus permanen.' },
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
