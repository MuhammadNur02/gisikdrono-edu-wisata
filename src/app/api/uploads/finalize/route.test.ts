import { PDFDocument, PDFName } from 'pdf-lib';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';
import { bookletPageObjectName, type BookletPageSlot } from '@/lib/uploads/paths';
import { createUuidV7 } from '@/lib/utils/uuid-v7';
import { requireUser, type StaffContext } from '@/server/auth/guards';

import { POST } from './route';
import { createFakeAdminClient } from '../../../../../tests/fixtures/fake-admin-client';
import { cleanBookletPdf, handWrittenPdf } from '../../../../../tests/fixtures/pdf';
import {
  iphoneHeicPhoto,
  jpegPhoto,
  mif1HeifPhoto,
  SVG_WITH_SCRIPT,
} from '../../../../../tests/fixtures/uploads';

const fake = vi.hoisted(() => ({ admin: null as ReturnType<typeof createFakeAdminClient> | null }));

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => fake.admin?.client }));
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
};

function admin() {
  if (!fake.admin) throw new Error('fake admin client missing');
  return fake.admin;
}

// A file the browser put into quarantine through a URL signed `secondsAfterSigning` seconds earlier.
function quarantined(bytes: Buffer, owner = 'rw-05', secondsAfterSigning = 5): string {
  const signedAt = Date.now() - 60_000;
  const path = `${owner}/${createUuidV7(signedAt)}`;
  admin().receiveUpload(path, bytes, new Date(signedAt + secondsAfterSigning * 1000));
  return path;
}

// A page the browser put into quarantine through a URL api/uploads/sign-pages signed for that slot.
function quarantinedPage(bytes: Buffer, slot: BookletPageSlot): string {
  const signedAt = Date.now() - 60_000;
  const path = `rw-05/${bookletPageObjectName(createUuidV7(signedAt), slot)}`;
  admin().receiveUpload(path, bytes, new Date(signedAt + 5000));
  return path;
}

function finalize(body: Record<string, unknown>) {
  return POST(
    new Request(`${SITE}/api/uploads/finalize`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', origin: SITE },
    }),
  );
}

async function expectRefused(response: Response, message: string, reason: string) {
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ ok: false, error: { code: 'VALIDATION', message } });
  expect(admin().publicMedia.size).toBe(0);
  expect(admin().quarantine.size).toBe(0);
  expect(admin().securityEvents).toEqual([
    expect.objectContaining({
      event_type: 'upload_rejected',
      actor_id: OFFICER_05.userId,
      rw_id: 5,
      details: expect.objectContaining({ reason }) as unknown,
    }),
  ]);
}

beforeEach(() => {
  fake.admin = createFakeAdminClient();
  vi.mocked(requireUser).mockReset().mockResolvedValue({ ok: true, ctx: OFFICER_05 });
});

describe('POST /api/uploads/finalize: images', () => {
  it('re-encodes a gallery photo to WebP with a thumbnail and empties the quarantine', async () => {
    const path = quarantined(await jpegPhoto(2400, 1800));
    const name = path.split('/')[1] ?? '';

    const response = await finalize({ path, purpose: 'gallery' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        kind: 'image',
        path: `rw-05/gallery/${name}.webp`,
        thumbnailPath: `rw-05/gallery/${name}-thumb.webp`,
        width: 1600,
        height: 1200,
      },
    });
    const published = admin().publicMedia.get(`rw-05/gallery/${name}.webp`);
    expect(published?.contentType).toBe('image/webp');
    expect((await sharp(published?.bytes).metadata()).exif).toBeUndefined();
    expect(admin().quarantine.size).toBe(0);
    expect(admin().securityEvents).toEqual([]);
  });

  it('refuses a real HEIC photo by its bytes, even under a JPEG name', async () => {
    const response = await finalize({ path: quarantined(iphoneHeicPhoto()), purpose: 'gallery' });

    await expectRefused(response, copy.uploads.problems.heic, 'heic');
    expect(admin().securityEvents[0]).toMatchObject({ severity: 'info' });
  });

  it('refuses a ftypmif1 HEIF the same way', async () => {
    const response = await finalize({ path: quarantined(mif1HeifPhoto()), purpose: 'gallery' });

    await expectRefused(response, copy.uploads.problems.heic, 'heic');
  });

  it('refuses SVG and records it as suspicious', async () => {
    const response = await finalize({ path: quarantined(SVG_WITH_SCRIPT), purpose: 'gallery' });

    await expectRefused(response, copy.uploads.problems.svg, 'svg');
    expect(admin().securityEvents[0]).toMatchObject({ severity: 'medium' });
  });

  it('publishes a polyglot only as the photo it re-encodes to, without its second file', async () => {
    const polyglot = Buffer.concat([
      await jpegPhoto(),
      Buffer.from('<html><script>alert("polyglot")</script></html>'),
    ]);

    const response = await finalize({ path: quarantined(polyglot), purpose: 'gallery' });

    expect(response.status).toBe(200);
    for (const file of admin().publicMedia.values()) {
      expect(file.bytes.toString('latin1')).not.toContain('polyglot');
    }
  });

  it('refuses a PDF where a photo belongs', async () => {
    const response = await finalize({ path: quarantined(handWrittenPdf()), purpose: 'gallery' });

    await expectRefused(response, copy.uploads.problems.wrong_kind, 'wrong_kind');
  });
});

describe('POST /api/uploads/finalize: booklet PDFs', () => {
  it('publishes a clean booklet as a PDF and reports its pages', async () => {
    const pdf = Buffer.from(await cleanBookletPdf());

    const response = await finalize({
      path: quarantined(pdf),
      purpose: 'booklet',
      entityId: BOOKLET_ID,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { kind: 'pdf', path: `rw-05/booklets/${BOOKLET_ID}/booklet.pdf`, pageCount: 2 },
    });
    expect(admin().publicMedia.get(`rw-05/booklets/${BOOKLET_ID}/booklet.pdf`)?.contentType).toBe(
      'application/pdf',
    );
  });

  it.each([
    ['a JavaScript open action', '/OpenAction << /S /JavaScript /JS (app.alert(1)) >>'],
    ['the hex-escaped /Open#41ction', '/Open#41ction << /S /JavaScript /JS (app.alert(1)) >>'],
  ])('refuses %s and records it as suspicious', async (_case, catalogExtra) => {
    const response = await finalize({
      path: quarantined(handWrittenPdf(catalogExtra)),
      purpose: 'booklet',
      entityId: BOOKLET_ID,
    });

    await expectRefused(response, copy.uploads.problems.pdf_active_content, 'pdf_active_content');
    expect(admin().securityEvents[0]).toMatchObject({
      severity: 'medium',
      details: expect.objectContaining({ found: 'OpenAction' }) as unknown,
    });
  });

  it('leaves out an /OpenAction that only opens a page and records upload_sanitized', async () => {
    const pdf = handWrittenPdf('/OpenAction << /S /GoTo /D [3 0 R /Fit] >>');

    const response = await finalize({
      path: quarantined(pdf),
      purpose: 'booklet',
      entityId: BOOKLET_ID,
    });

    expect(response.status).toBe(200);
    const published = admin().publicMedia.get(`rw-05/booklets/${BOOKLET_ID}/booklet.pdf`);
    const republished = await PDFDocument.load(new Uint8Array(published?.bytes ?? []));
    expect(republished.catalog.get(PDFName.of('OpenAction'))).toBeUndefined();
    expect(admin().securityEvents).toEqual([
      expect.objectContaining({
        event_type: 'upload_sanitized',
        severity: 'info',
        rw_id: 5,
        details: expect.objectContaining({ removed: 'OpenAction', kind: 'goto' }) as unknown,
      }),
    ]);
  });

  it('refuses a booklet over 100 pages', async () => {
    const document = await PDFDocument.create();
    for (let page = 0; page < 101; page += 1) document.addPage([420, 595]);

    const response = await finalize({
      path: quarantined(Buffer.from(await document.save())),
      purpose: 'booklet',
      entityId: BOOKLET_ID,
    });

    await expectRefused(response, copy.uploads.problems.pdf_too_many_pages, 'pdf_too_many_pages');
  });

  it('turns a signed booklet page into the numbered WebP its path names', async () => {
    const path = quarantinedPage(await jpegPhoto(1200, 1600), {
      bookletId: BOOKLET_ID,
      pageNumber: 3,
      pageCount: 40,
    });

    const response = await finalize({ path, purpose: 'booklet-page' });

    expect(await response.json()).toMatchObject({
      data: { path: `rw-05/booklets/${BOOKLET_ID}/pages/0003.webp`, thumbnailPath: null },
    });
  });

  it('never replaces a published file: a second booklet PDF for the same row is a conflict', async () => {
    const pdf = Buffer.from(await cleanBookletPdf());
    const body = { purpose: 'booklet', entityId: BOOKLET_ID };
    await finalize({ ...body, path: quarantined(pdf) });
    const secondPath = quarantined(pdf);

    const response = await finalize({ ...body, path: secondPath });

    expect(response.status).toBe(409);
    // Kept for the hourly purge; nothing new reached public-media.
    expect(admin().quarantine.has(secondPath)).toBe(true);
  });
});

describe('POST /api/uploads/finalize: the path and the officer', () => {
  it('refuses an RW 05 officer finalising an RW 08 upload, records it and touches nothing', async () => {
    const path = quarantined(await jpegPhoto(), 'rw-08');

    const response = await finalize({ path, purpose: 'gallery' });

    expect(response.status).toBe(403);
    expect(admin().quarantine.has(path)).toBe(true);
    expect(admin().publicMedia.size).toBe(0);
    expect(admin().securityEvents).toEqual([
      expect.objectContaining({
        severity: 'high',
        rw_id: 8,
        details: expect.objectContaining({ reason: 'forbidden', owner: 'rw-08' }) as unknown,
      }),
    ]);
  });

  it('refuses a session without a TOTP check', async () => {
    vi.mocked(requireUser).mockResolvedValue({ ok: true, ctx: { ...OFFICER_05, isAal2: false } });

    const response = await finalize({ path: quarantined(await jpegPhoto()), purpose: 'gallery' });

    expect(response.status).toBe(403);
  });

  it('refuses a file that arrived more than five minutes after it was signed', async () => {
    const path = quarantined(await jpegPhoto(), 'rw-05', 301);

    const response = await finalize({ path, purpose: 'gallery' });

    await expectRefused(response, copy.uploads.problems.late, 'late');
  });

  it('answers 404 when the quarantine object is not there', async () => {
    const path = `rw-05/${createUuidV7()}`;

    const response = await finalize({ path, purpose: 'gallery' });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { message: copy.uploads.problems.missing },
    });
  });

  it.each([
    ['a path sign never made', { path: 'rw-05/../rw-08/foto.jpg', purpose: 'gallery' }],
    ['a hero banner from an RW prefix', { path: `rw-05/${createUuidV7()}`, purpose: 'hero' }],
    ['a product without its row', { path: `rw-05/${createUuidV7()}`, purpose: 'product' }],
    [
      'a booklet page that sign-pages did not sign',
      { path: `rw-05/${createUuidV7()}`, purpose: 'booklet-page' },
    ],
    [
      'a page past the page count of its booklet',
      { path: `rw-05/${createUuidV7()}.${BOOKLET_ID}.0041.0040`, purpose: 'booklet-page' },
    ],
    [
      'a booklet of more than 100 pages',
      { path: `rw-05/${createUuidV7()}.${BOOKLET_ID}.0101.0101`, purpose: 'booklet-page' },
    ],
    [
      'a signed page sent as a gallery photo',
      { path: `rw-05/${createUuidV7()}.${BOOKLET_ID}.0001.0040`, purpose: 'gallery' },
    ],
    [
      'a page number chosen by the browser',
      {
        path: `rw-05/${createUuidV7()}.${BOOKLET_ID}.0001.0040`,
        purpose: 'booklet-page',
        pageNumber: 2,
      },
    ],
    [
      'another booklet named by the browser',
      {
        path: `rw-05/${createUuidV7()}.${BOOKLET_ID}.0001.0040`,
        purpose: 'booklet-page',
        entityId: '00000000-0000-4000-8000-0000000b0099',
      },
    ],
  ])('refuses %s before anything is read', async (_case, body) => {
    const response = await finalize(body);

    expect(response.status).toBe(400);
    expect(requireUser).not.toHaveBeenCalled();
  });
});
