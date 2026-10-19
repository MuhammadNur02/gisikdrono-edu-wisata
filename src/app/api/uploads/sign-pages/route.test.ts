import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcRateLimitHit } from '@/db/rpc';
import { copy } from '@/lib/copy/id';
import { parseQuarantinePath } from '@/lib/uploads/paths';
import { requireUser, type StaffContext } from '@/server/auth/guards';
import type { SignedBookletPages } from '@/types/upload';

import { POST } from './route';
import { createFakeAdminClient } from '../../../../../tests/fixtures/fake-admin-client';

const fake = vi.hoisted(() => ({ admin: null as ReturnType<typeof createFakeAdminClient> | null }));

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => fake.admin?.client }));
// Only the rate limiter is stubbed; the page claim runs through the fake client like the database would.
vi.mock('@/db/rpc', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  svcRateLimitHit: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));
vi.mock('next/headers', () => ({ headers: () => Promise.reject(new Error('outside a request')) }));
vi.mock('@/server/auth/guards', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireUser: vi.fn(),
}));

const SITE = 'http://127.0.0.1:3000';
const BOOKLET_ID = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const OFFICER_05: StaffContext = {
  userId: '00000000-0000-4000-8000-000000000005',
  role: 'admin_rw',
  rwId: 5,
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
};

function admin() {
  if (!fake.admin) throw new Error('fake admin client missing');
  return fake.admin;
}

// What finalize leaves in public-media for a booklet of `pages` pages.
async function publishBooklet(pages: number, owner = 'rw-05') {
  const document = await PDFDocument.create();
  for (let page = 0; page < pages; page += 1) document.addPage([420, 595]);
  admin().publicMedia.set(`${owner}/booklets/${BOOKLET_ID}/booklet.pdf`, {
    bytes: Buffer.from(await document.save()),
    createdAt: new Date().toISOString(),
    contentType: 'application/pdf',
  });
}

function signPages(body: unknown) {
  return POST(
    new Request(`${SITE}/api/uploads/sign-pages`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', origin: SITE },
    }),
  );
}

beforeEach(() => {
  fake.admin = createFakeAdminClient();
  fake.admin.addStaff(OFFICER_05);
  vi.mocked(svcRateLimitHit).mockReset().mockResolvedValue(true);
  vi.mocked(requireUser).mockReset().mockResolvedValue({ ok: true, ctx: OFFICER_05 });
});

describe('POST /api/uploads/sign-pages', () => {
  it('signs one URL per page of the published booklet, each bound to its page, as one signature', async () => {
    await publishBooklet(3);

    const response = await signPages({ rwId: 5, bookletId: BOOKLET_ID });

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: SignedBookletPages };
    expect(data.pageCount).toBe(3);
    expect(data.pages.map((page) => parseQuarantinePath(page.path)?.page)).toEqual([
      { bookletId: BOOKLET_ID, pageNumber: 1, pageCount: 3 },
      { bookletId: BOOKLET_ID, pageNumber: 2, pageCount: 3 },
      { bookletId: BOOKLET_ID, pageNumber: 3, pageCount: 3 },
    ]);
    expect(data.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
    expect(data.pages[0]?.token).toBe(`token-for-${data.pages[0]?.path ?? ''}`);
    expect(svcRateLimitHit).toHaveBeenCalledTimes(1);
    expect(svcRateLimitHit).toHaveBeenCalledWith(fake.admin?.client, {
      key: `upload_sign:${OFFICER_05.userId}`,
      limit: 60,
      windowSeconds: 3600,
    });
  });

  it('answers 404 before the booklet PDF is published, or when it sits under another RW', async () => {
    const before = await signPages({ rwId: 5, bookletId: BOOKLET_ID });
    await publishBooklet(3, 'rw-08');
    const elsewhere = await signPages({ rwId: 5, bookletId: BOOKLET_ID });

    for (const response of [before, elsewhere]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: { message: copy.uploads.problems.booklet_missing },
      });
    }
  });

  it('refuses a booklet over 100 pages', async () => {
    await publishBooklet(101);

    const response = await signPages({ rwId: 5, bookletId: BOOKLET_ID });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { message: copy.uploads.problems.pdf_too_many_pages },
    });
  });

  it('refuses an RW 05 officer asking for an RW 08 booklet and records the attempt', async () => {
    await publishBooklet(3, 'rw-08');

    const response = await signPages({ rwId: 8, bookletId: BOOKLET_ID });

    expect(response.status).toBe(403);
    expect(admin().securityEvents).toEqual([
      expect.objectContaining({
        event_type: 'upload_rejected',
        severity: 'high',
        rw_id: 8,
        details: expect.objectContaining({ reason: 'forbidden', step: 'sign-pages' }) as unknown,
      }),
    ]);
    // Only the limit on refused attempts is counted, never a signature (review L8).
    expect(svcRateLimitHit).toHaveBeenCalledWith(fake.admin?.client, {
      key: `upload_forbidden:${OFFICER_05.userId}`,
      limit: 10,
      windowSeconds: 3600,
    });
    expect(svcRateLimitHit).not.toHaveBeenCalledWith(
      fake.admin?.client,
      expect.objectContaining({ key: `upload_sign:${OFFICER_05.userId}` }),
    );
  });

  it('answers 429 once the hourly signatures are used up', async () => {
    await publishBooklet(3);
    vi.mocked(svcRateLimitHit).mockResolvedValue(false);

    const response = await signPages({ rwId: 5, bookletId: BOOKLET_ID });

    expect(response.status).toBe(429);
  });

  // Security review of PR #14, L11.
  it('answers 409 to a second request for the same booklet', async () => {
    await publishBooklet(3);

    await signPages({ rwId: 5, bookletId: BOOKLET_ID });
    const second = await signPages({ rwId: 5, bookletId: BOOKLET_ID });

    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({
      error: { code: 'CONFLICT', message: copy.uploads.problems.booklet_pages_in_progress },
    });
  });

  // Security review of PR #14, F8.
  it('answers a published PDF it cannot read with 400 and a clear message, not 500', async () => {
    admin().publicMedia.set(`rw-05/booklets/${BOOKLET_ID}/booklet.pdf`, {
      bytes: Buffer.from('%PDF-1.7\nnot a booklet at all'),
      createdAt: new Date().toISOString(),
      contentType: 'application/pdf',
    });

    const response = await signPages({ rwId: 5, bookletId: BOOKLET_ID });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION', message: copy.uploads.problems.unreadable },
    });
  });

  it('never takes a page count from the browser', async () => {
    await publishBooklet(3);

    const response = await signPages({ rwId: 5, bookletId: BOOKLET_ID, pageCount: 100 });

    expect(response.status).toBe(400);
    expect(requireUser).not.toHaveBeenCalled();
  });
});
