import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_IMAGE_BYTES } from '@/config/uploads';
import {
  bookletPageObjectName,
  parseQuarantinePath,
  type QuarantineUpload,
} from '@/lib/uploads/paths';
import { createUuidV7 } from '@/lib/utils/uuid-v7';
import type { StaffContext } from '@/server/auth/guards';

import { checkUploadAccess, finalizeUpload, signBookletPages } from './upload-service';
import {
  bookletClaimKey,
  createFakeAdminClient,
  type FakeAdminClient,
} from '../../../tests/fixtures/fake-admin-client';
import { cleanBookletPdf } from '../../../tests/fixtures/pdf';
import { jpegPhoto, SVG_WITH_SCRIPT } from '../../../tests/fixtures/uploads';

// The service's answers to the abuse cases of the security review of PR #14 (M2, L1, L6 to L9, L11), against the
// in-memory service-role client. The real Storage behaviour they rest on is proven in tests/integration/uploads.

const fake = vi.hoisted(() => ({ admin: null as FakeAdminClient | null }));

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => fake.admin?.client }));

const BOOKLET_ID = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const MINUTE_MS = 60_000;
const OFFICER_05: StaffContext = {
  userId: '00000000-0000-4000-8000-000000000005',
  role: 'admin_rw',
  rwId: 5,
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 4,
};

function admin(): FakeAdminClient {
  if (!fake.admin) throw new Error('fake admin client missing');
  return fake.admin;
}

// A file put in quarantine `arrivedAfterMs` after its URL was signed at `signedAt`.
function quarantined(
  bytes: Buffer,
  options: {
    signedAt?: number;
    arrivedAfterMs?: number;
    objectName?: (uuid: string) => string;
  } = {},
): QuarantineUpload {
  const signedAt = options.signedAt ?? Date.now() - MINUTE_MS;
  const uuid = createUuidV7(signedAt);
  const path = `rw-05/${options.objectName ? options.objectName(uuid) : uuid}`;
  admin().receiveUpload(path, bytes, new Date(signedAt + (options.arrivedAfterMs ?? 5000)));
  const upload = parseQuarantinePath(path);
  if (!upload) throw new Error(`test path ${path} does not parse`);
  return upload;
}

function pagePath(pageNumber: number) {
  return (uuid: string) =>
    bookletPageObjectName(uuid, { bookletId: BOOKLET_ID, pageNumber, pageCount: 2 });
}

function eventsOfType(type: string) {
  return admin().securityEvents.filter((event) => event.event_type === type);
}

async function publishBookletPdf() {
  const pdf = Buffer.from(await cleanBookletPdf());
  const outcome = await finalizeUpload(OFFICER_05, quarantined(pdf), {
    purpose: 'booklet',
    entityId: BOOKLET_ID,
  });
  if (!outcome.ok) throw new Error(`the clean booklet was refused: ${outcome.problem}`);
}

beforeEach(() => {
  fake.admin = createFakeAdminClient();
  fake.admin.addStaff(OFFICER_05);
});

describe('L6: a signed upload is used once', () => {
  it('leaves an empty tombstone, so the token cannot refill the path and a second finalize is refused', async () => {
    const upload = quarantined(await jpegPhoto());
    const path = `rw-05/${upload.objectName}`;

    const first = await finalizeUpload(OFFICER_05, upload, { purpose: 'gallery' });

    expect(first.ok).toBe(true);
    expect(admin().quarantine.get(path)?.bytes.length).toBe(0);
    expect(admin().receiveUpload(path, await jpegPhoto())).toBe(false);
    await expect(finalizeUpload(OFFICER_05, upload, { purpose: 'gallery' })).resolves.toEqual({
      ok: false,
      problem: 'already_used',
    });
    expect(admin().publicMedia.size).toBe(2);
  });

  it('retires the file after a refusal too, so a second try cannot slip another file in', async () => {
    const upload = quarantined(SVG_WITH_SCRIPT);

    await finalizeUpload(OFFICER_05, upload, { purpose: 'gallery' });

    expect(admin().quarantinedFiles()).toEqual([]);
    expect(admin().receiveUpload(`rw-05/${upload.objectName}`, await jpegPhoto())).toBe(false);
  });

  it('empties the quarantine object when the answer is a conflict', async () => {
    await publishBookletPdf();
    const second = quarantined(Buffer.from(await cleanBookletPdf()));

    await expect(
      finalizeUpload(OFFICER_05, second, { purpose: 'booklet', entityId: BOOKLET_ID }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(admin().quarantinedFiles()).toEqual([]);
  });

  it('stops a staff member after 300 finalizes in an hour, recorded once, and leaves the file alone', async () => {
    admin().rateLimitHits.set(`upload_finalize:${OFFICER_05.userId}`, 300);
    const upload = quarantined(await jpegPhoto());

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        finalizeUpload(OFFICER_05, upload, { purpose: 'gallery' }),
      ).rejects.toMatchObject({
        code: 'RATE_LIMITED',
      });
    }

    expect(eventsOfType('rate_limited')).toEqual([
      expect.objectContaining({
        severity: 'medium',
        details: expect.objectContaining({ limit: 'upload_finalize' }) as unknown,
      }),
    ]);
    expect(admin().quarantinedFiles()).toEqual([`rw-05/${upload.objectName}`]);
    expect(admin().downloads).toEqual([]);
  });
});

describe('L7 and M2: the five-minute window, measured when the upload finished', () => {
  it('counts a time Storage cannot give as late', async () => {
    const upload = quarantined(await jpegPhoto());
    const stored = admin().quarantine.get(`rw-05/${upload.objectName}`);
    if (stored) stored.createdAt = 'not a date';

    await expect(finalizeUpload(OFFICER_05, upload, { purpose: 'gallery' })).resolves.toEqual({
      ok: false,
      problem: 'late',
    });
  });

  it('publishes a page uploaded in time even when finalize runs twenty minutes later', async () => {
    const upload = quarantined(await jpegPhoto(1131, 1600), {
      signedAt: Date.now() - 20 * MINUTE_MS,
      arrivedAfterMs: 10_000,
      objectName: pagePath(1),
    });

    await expect(
      finalizeUpload(OFFICER_05, upload, { purpose: 'booklet-page' }),
    ).resolves.toMatchObject({
      ok: true,
      data: { path: `rw-05/booklets/${BOOKLET_ID}/pages/0001.webp` },
    });
  });

  it('refuses a page uploaded after the window, however soon finalize runs', async () => {
    const upload = quarantined(await jpegPhoto(1131, 1600), {
      arrivedAfterMs: 301_000,
      objectName: pagePath(1),
    });

    await expect(finalizeUpload(OFFICER_05, upload, { purpose: 'booklet-page' })).resolves.toEqual({
      ok: false,
      problem: 'late',
    });
  });

  it('answers CONFLICT for a page already published, the answer a retrying browser takes as done', async () => {
    const page = await jpegPhoto(1131, 1600);
    await finalizeUpload(OFFICER_05, quarantined(page, { objectName: pagePath(2) }), {
      purpose: 'booklet-page',
    });
    const retry = quarantined(page, { objectName: pagePath(2) });

    await expect(
      finalizeUpload(OFFICER_05, retry, { purpose: 'booklet-page' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(admin().publicMedia.size).toBe(1);
    expect(admin().quarantinedFiles()).toEqual([]);
  });
});

describe('L1: the size is read from Storage before the file is downloaded', () => {
  it('refuses an oversized file without reading it', async () => {
    const upload = quarantined(Buffer.alloc(MAX_IMAGE_BYTES + 1));

    await expect(finalizeUpload(OFFICER_05, upload, { purpose: 'gallery' })).resolves.toEqual({
      ok: false,
      problem: 'image_size',
    });
    expect(admin().downloads).toEqual([]);
  });
});

describe('L8 and L9: who may upload is read from the profile', () => {
  it.each([
    ['a deactivated officer', { is_active: false }],
    ['a token issued before the profile changed', { claims_version: 5 }],
    ['an officer moved to RW 08 whose token still says RW 05', { rw_id: 8 }],
    ['an officer whose role was taken away', { role: 'none' as const }],
  ])('refuses %s', async (_case, changes) => {
    admin().addStaff(OFFICER_05, changes);

    await expect(checkUploadAccess(OFFICER_05, 5, { step: 'sign' })).resolves.toBe(false);
    expect(eventsOfType('upload_rejected')).toEqual([
      expect.objectContaining({
        details: expect.objectContaining({ reason: 'forbidden' }) as unknown,
      }),
    ]);
  });

  it('refuses a staff member with no profile at all', async () => {
    admin().profiles.clear();

    await expect(checkUploadAccess(OFFICER_05, 5, { step: 'sign' })).resolves.toBe(false);
    expect(eventsOfType('upload_rejected')[0]).toMatchObject({ details: { why: 'profile' } });
  });

  it('lets the officer in while the profile matches the token', async () => {
    await expect(checkUploadAccess(OFFICER_05, 5, { step: 'sign' })).resolves.toBe(true);
    expect(admin().securityEvents).toEqual([]);
  });

  it('records ten refusals an hour, then one rate_limited row for the rest', async () => {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await checkUploadAccess(OFFICER_05, 8, { step: 'sign' });
    }

    expect(eventsOfType('upload_rejected')).toHaveLength(10);
    expect(eventsOfType('rate_limited')).toEqual([
      expect.objectContaining({
        severity: 'high',
        details: expect.objectContaining({ limit: 'upload_forbidden' }) as unknown,
      }),
    ]);
  });
});

describe('L11: one sign-pages per booklet', () => {
  it('refuses a second request while the first one’s URLs are alive', async () => {
    await publishBookletPdf();

    const first = await signBookletPages(OFFICER_05, { rwId: 5, bookletId: BOOKLET_ID });
    const second = await signBookletPages(OFFICER_05, { rwId: 5, bookletId: BOOKLET_ID });

    expect(first).toMatchObject({ ok: true, data: { pageCount: 2 } });
    expect(second).toEqual({ ok: false, problem: 'booklet_pages_in_progress' });
  });

  it('refuses a booklet whose pages are published, before it counts a signature', async () => {
    await publishBookletPdf();
    await finalizeUpload(
      OFFICER_05,
      quarantined(await jpegPhoto(1131, 1600), { objectName: pagePath(1) }),
      {
        purpose: 'booklet-page',
      },
    );

    await expect(signBookletPages(OFFICER_05, { rwId: 5, bookletId: BOOKLET_ID })).resolves.toEqual(
      {
        ok: false,
        problem: 'booklet_pages_exist',
      },
    );
    expect(admin().rateLimitHits.get(`upload_sign:${OFFICER_05.userId}`)).toBeUndefined();
  });

  it('signs again once the earlier URLs have all expired', async () => {
    await publishBookletPdf();
    const threeHoursAgo = Date.now() - 180 * MINUTE_MS;
    await signBookletPages(OFFICER_05, { rwId: 5, bookletId: BOOKLET_ID }, threeHoursAgo);
    admin().bookletClaims.set(bookletClaimKey(BOOKLET_ID, 5), threeHoursAgo);

    await expect(
      signBookletPages(OFFICER_05, { rwId: 5, bookletId: BOOKLET_ID }),
    ).resolves.toMatchObject({
      ok: true,
    });
  });
});
