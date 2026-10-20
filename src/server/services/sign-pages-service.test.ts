import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RATE_LIMITS } from '@/config/rate-limits';
import { MAX_CONCURRENT_PDF_SCANS } from '@/config/uploads';
import { rateLimitKey } from '@/lib/rate-limit';
import { bookletPageObjectName, bookletPdfPath } from '@/lib/uploads/paths';
import { withScanSlot } from '@/lib/uploads/scan-slots';

import { finalizeUpload, signBookletPages } from './upload-service';
import {
  createFakeAdminClient,
  type FakeAdminClient,
} from '../../../tests/fixtures/fake-admin-client';
import { cleanBookletPdf } from '../../../tests/fixtures/pdf';
import { BOOKLET_ID, OFFICER_05, quarantinedIn } from '../../../tests/fixtures/upload-service';
import { jpegPhoto } from '../../../tests/fixtures/uploads';

// Security review of PR #14, F2 and F8: api/uploads/sign-pages counts the signature first and does the cheap checks
// before the download and parse of the published PDF, inside a scan slot taken before the claim; a published PDF
// pdf-lib cannot read is an answer, not a server error.

const fake = vi.hoisted(() => ({ admin: null as FakeAdminClient | null }));

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => fake.admin?.client }));

const REQUEST = { rwId: 5 as const, bookletId: BOOKLET_ID };
const SIGN_KEY = rateLimitKey('upload_sign', OFFICER_05.userId);
const PDF_PATH = bookletPdfPath(5, BOOKLET_ID);

function admin(): FakeAdminClient {
  if (!fake.admin) throw new Error('fake admin client missing');
  return fake.admin;
}

async function publishBookletPdf() {
  const upload = quarantinedIn(admin(), Buffer.from(await cleanBookletPdf()));
  const outcome = await finalizeUpload(OFFICER_05, upload, {
    purpose: 'booklet',
    entityId: BOOKLET_ID,
  });
  if (!outcome.ok) throw new Error(`the clean booklet was refused: ${outcome.problem}`);
}

function bookletPdfDownloads(): string[] {
  return admin().downloads.filter((path) => path === PDF_PATH);
}

beforeEach(() => {
  fake.admin = createFakeAdminClient();
  fake.admin.addStaff(OFFICER_05);
});

describe('api/uploads/sign-pages: the order of its checks', () => {
  it('counts the signature before it looks at anything', async () => {
    await expect(signBookletPages(OFFICER_05, REQUEST)).resolves.toEqual({
      ok: false,
      problem: 'booklet_missing',
    });
    expect(admin().rateLimitHits.get(SIGN_KEY)).toBe(1);
    expect(admin().downloads).toEqual([]);
  });

  it('answers a booklet whose pages are published without downloading its PDF again, within the limit', async () => {
    await publishBookletPdf();
    const page = quarantinedIn(admin(), await jpegPhoto(1131, 1600), (uuid) =>
      bookletPageObjectName(uuid, { bookletId: BOOKLET_ID, pageNumber: 1, pageCount: 2 }),
    );
    await finalizeUpload(OFFICER_05, page, { purpose: 'booklet-page' });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(signBookletPages(OFFICER_05, REQUEST)).resolves.toEqual({
        ok: false,
        problem: 'booklet_pages_exist',
      });
    }
    expect(bookletPdfDownloads()).toEqual([]);

    admin().rateLimitHits.set(SIGN_KEY, RATE_LIMITS.upload_sign.limit);
    await expect(signBookletPages(OFFICER_05, REQUEST)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('turns the request away while the process is busy scanning, before it takes the claim', async () => {
    await publishBookletPdf();
    const releases: (() => void)[] = [];
    const busyScans = Array.from({ length: MAX_CONCURRENT_PDF_SCANS }, () =>
      withScanSlot(() => new Promise<void>((resolve) => releases.push(resolve))),
    );

    await expect(signBookletPages(OFFICER_05, REQUEST)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(admin().bookletClaims.size).toBe(0);
    expect(bookletPdfDownloads()).toEqual([]);

    for (const release of releases) release();
    await Promise.all(busyScans);
    await expect(signBookletPages(OFFICER_05, REQUEST)).resolves.toMatchObject({ ok: true });
  });
});

describe('api/uploads/sign-pages: a published PDF it cannot read', () => {
  it('answers unreadable instead of failing with a server error', async () => {
    admin().publicMedia.set(PDF_PATH, {
      bytes: Buffer.from('%PDF-1.7\nnot a booklet at all'),
      createdAt: new Date().toISOString(),
    });

    await expect(signBookletPages(OFFICER_05, REQUEST)).resolves.toEqual({
      ok: false,
      problem: 'unreadable',
    });
  });
});
