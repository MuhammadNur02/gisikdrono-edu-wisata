import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LEADING_BYTES_LENGTH, MAX_IMAGE_BYTES } from '@/config/uploads';
import { svcRateLimitHit } from '@/db/rpc';
import { copy } from '@/lib/copy/id';
import { parseQuarantinePath } from '@/lib/uploads/paths';
import { requireUser, type StaffContext } from '@/server/auth/guards';

import { POST } from './route';
import { createFakeAdminClient } from '../../../../../tests/fixtures/fake-admin-client';
import {
  iphoneHeicPhoto,
  jpegPhoto,
  mif1HeifPhoto,
  SVG_WITH_SCRIPT,
} from '../../../../../tests/fixtures/uploads';

const fake = vi.hoisted(() => ({ admin: null as ReturnType<typeof createFakeAdminClient> | null }));

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => fake.admin?.client }));
vi.mock('@/db/rpc', () => ({ svcRateLimitHit: vi.fn() }));
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
const OFFICER_05: StaffContext = {
  userId: '00000000-0000-4000-8000-000000000005',
  role: 'admin_rw',
  rwId: 5,
  isAal2: true,
  totpVerifiedAt: null,
};

function signRequest(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request(`${SITE}/api/uploads/sign`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', origin: SITE, ...headers },
    }),
  );
}

function bodyFor(file: Buffer, contentType: string, rwId: number | null = 5) {
  return {
    rwId,
    contentType,
    size: file.length,
    leadingBytes: file.subarray(0, LEADING_BYTES_LENGTH).toString('base64'),
  };
}

beforeEach(() => {
  fake.admin = createFakeAdminClient();
  vi.mocked(svcRateLimitHit).mockReset().mockResolvedValue(true);
  vi.mocked(requireUser).mockReset().mockResolvedValue({ ok: true, ctx: OFFICER_05 });
});

describe('POST /api/uploads/sign', () => {
  it('signs a JPEG into the officer’s own RW prefix under a fresh UUID v7', async () => {
    const response = await signRequest(bodyFor(await jpegPhoto(), 'image/jpeg'));

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: { path: string; token: string } };
    expect(parseQuarantinePath(data.path)).toMatchObject({ owner: 'rw-05', rwId: 5 });
    expect(data.token).toBe(`token-for-${data.path}`);
    expect(svcRateLimitHit).toHaveBeenCalledWith(fake.admin?.client, {
      key: `upload_sign:${OFFICER_05.userId}`,
      limit: 60,
      windowSeconds: 3600,
    });
  });

  it.each([
    ['declared as HEIC', iphoneHeicPhoto(), 'image/heic'],
    ['renamed to .jpg and declared as JPEG', iphoneHeicPhoto(), 'image/jpeg'],
    ['with no type, as Windows reports it', iphoneHeicPhoto(), ''],
    ['written as ftypmif1', mif1HeifPhoto(), 'image/heif'],
  ])('refuses a real HEIC photo %s with the iPhone message', async (_case, photo, contentType) => {
    const response = await signRequest(bodyFor(photo, contentType));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: copy.uploads.problems.heic },
    });
  });

  it('refuses SVG with its own message, whatever type the browser claims', async () => {
    const response = await signRequest(bodyFor(SVG_WITH_SCRIPT, 'image/png'));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { message: copy.uploads.problems.svg },
    });
  });

  it('refuses a photo over 10 MB', async () => {
    const body = { ...bodyFor(await jpegPhoto(), 'image/jpeg'), size: MAX_IMAGE_BYTES + 1 };

    const response = await signRequest(body);

    expect(await response.json()).toMatchObject({
      error: { message: copy.uploads.problems.image_size },
    });
  });

  it('refuses a path chosen by the browser', async () => {
    const body = { ...bodyFor(await jpegPhoto(), 'image/jpeg'), path: 'rw-08/foto.jpg' };

    const response = await signRequest(body);

    expect(response.status).toBe(400);
    expect(svcRateLimitHit).not.toHaveBeenCalled();
  });

  it('refuses an RW 05 officer asking for RW 08 or the kelurahan and records the attempt', async () => {
    const jpeg = await jpegPhoto();

    const otherRw = await signRequest(bodyFor(jpeg, 'image/jpeg', 8));
    const kelurahan = await signRequest(bodyFor(jpeg, 'image/jpeg', null));

    expect([otherRw.status, kelurahan.status]).toEqual([403, 403]);
    expect(fake.admin?.securityEvents).toEqual([
      expect.objectContaining({
        event_type: 'upload_rejected',
        severity: 'high',
        rw_id: 8,
        details: expect.objectContaining({ reason: 'forbidden', step: 'sign' }) as unknown,
      }),
      expect.objectContaining({ rw_id: null, severity: 'high' }),
    ]);
    expect(svcRateLimitHit).not.toHaveBeenCalled();
  });

  it('refuses a session without a TOTP check', async () => {
    vi.mocked(requireUser).mockResolvedValue({ ok: true, ctx: { ...OFFICER_05, isAal2: false } });

    const response = await signRequest(bodyFor(await jpegPhoto(), 'image/jpeg'));

    expect(response.status).toBe(403);
  });

  it('answers 429 after 60 signatures in an hour', async () => {
    vi.mocked(svcRateLimitHit).mockResolvedValue(false);

    const response = await signRequest(bodyFor(await jpegPhoto(), 'image/jpeg'));

    expect(response.status).toBe(429);
  });

  it('answers 401 to a visitor without a session', async () => {
    vi.mocked(requireUser).mockResolvedValue({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: copy.errors.UNAUTHENTICATED },
    });

    const response = await signRequest(bodyFor(await jpegPhoto(), 'image/jpeg'));

    expect(response.status).toBe(401);
  });

  it('refuses another origin, a request without one, and a body that is not JSON', async () => {
    const body = bodyFor(await jpegPhoto(), 'image/jpeg');

    expect((await signRequest(body, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await signRequest(body, { origin: '' })).status).toBe(403);
    expect((await signRequest(body, { 'content-type': 'text/plain' })).status).toBe(415);
    expect(requireUser).not.toHaveBeenCalled();
  });
});
