import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAal2, type StaffContext } from '@/server/auth/guards';
import {
  createBooklet,
  readBookletOwner,
  removeBooklet,
  updateBooklet,
} from '@/server/services/booklet-service';

import { createBookletAction, removeBookletAction, updateBookletAction } from './booklets';

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireAal2: vi.fn() }));
vi.mock('@/server/services/booklet-service', () => ({
  createBooklet: vi.fn(),
  readBookletOwner: vi.fn(),
  removeBooklet: vi.fn(),
  updateBooklet: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const BASE = { userId: 'user-1', isAal2: true, totpVerifiedAt: null, claimsVersion: 1 };
const ADMIN_05: StaffContext = { ...BASE, role: 'admin_rw', rwId: 5 };
const SUPERADMIN: StaffContext = { ...BASE, role: 'superadmin', rwId: null };
const BOOKLET_ID = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const BOOKLET = {
  id: BOOKLET_ID,
  pdfPath: `rw-05/booklets/${BOOKLET_ID}/booklet.pdf`,
  kind: 'ebooklet',
  slug: 'ecowastreme-2026',
  title: 'Mengenal Ecowastreme RW 05',
  description: '',
  status: 'published',
};

beforeEach(() => {
  cookie.value = undefined;
  vi.mocked(requireAal2).mockReset().mockResolvedValue({ ok: true, ctx: ADMIN_05 });
  for (const mock of [createBooklet, updateBooklet, removeBooklet]) vi.mocked(mock).mockReset();
  vi.mocked(readBookletOwner).mockReset().mockResolvedValue(5);
  vi.mocked(revalidateTag).mockReset();
});

describe('booklet actions', () => {
  it("files the RW admin's booklet under their own RW, even with an RW 08 scope cookie", async () => {
    cookie.value = '8';
    await createBookletAction(BOOKLET);
    expect(createBooklet).toHaveBeenCalledWith(
      ADMIN_05,
      5,
      expect.objectContaining({ id: BOOKLET_ID }),
    );
    expect(revalidateTag).toHaveBeenCalledWith('booklets');
  });

  it("files the superadmin's booklet under Semua as the kelurahan's", async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    await createBookletAction(BOOKLET);
    expect(createBooklet).toHaveBeenCalledWith(SUPERADMIN, null, expect.anything());
  });

  // The guard half of the proof (the RLS half: supabase/tests/rls_content_writes.sql).
  it('refuses an RW 05 admin a booklet the database holds for RW 08 or for the kelurahan', async () => {
    for (const owner of [8, null] as const) {
      vi.mocked(readBookletOwner).mockResolvedValue(owner);
      expect(await updateBookletAction(BOOKLET)).toMatchObject({ error: { code: 'FORBIDDEN' } });
    }
    expect(updateBooklet).not.toHaveBeenCalled();
  });

  it('updates a booklet of their own RW with the owner the database holds', async () => {
    await updateBookletAction(BOOKLET);
    expect(updateBooklet).toHaveBeenCalledWith(5, expect.objectContaining({ id: BOOKLET_ID }));
    expect(revalidateTag).toHaveBeenCalledWith('booklets');
  });

  it('leaves removing to the superadmin, before anything is looked up', async () => {
    expect(await removeBookletAction({ id: BOOKLET_ID })).toMatchObject({
      error: { code: 'FORBIDDEN', message: 'Hanya superadmin yang bisa menghapus booklet.' },
    });
    expect(readBookletOwner).not.toHaveBeenCalled();
    expect(removeBooklet).not.toHaveBeenCalled();
  });

  it('removes a booklet for the superadmin with the owner the database holds', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    vi.mocked(readBookletOwner).mockResolvedValue(8);
    await removeBookletAction({ id: BOOKLET_ID });
    expect(removeBooklet).toHaveBeenCalledWith(SUPERADMIN, 8, BOOKLET_ID);
    expect(revalidateTag).toHaveBeenCalledWith('booklets');
  });

  it('refuses a form that names the owner or the page count', async () => {
    for (const extra of [{ rwId: 8 }, { pageCount: 100 }]) {
      expect(await createBookletAction({ ...BOOKLET, ...extra })).toMatchObject({
        error: { code: 'VALIDATION' },
      });
    }
    expect(createBooklet).not.toHaveBeenCalled();
  });
});
