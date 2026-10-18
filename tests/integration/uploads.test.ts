import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { LEADING_BYTES_LENGTH } from '@/config/uploads';
import { parseQuarantinePath, type MediaTarget, type QuarantineUpload } from '@/lib/uploads/paths';
import type { StaffContext } from '@/server/auth/guards';
import { finalizeUpload, signBookletPages, signUpload } from '@/server/services/upload-service';

import { localStack, runSql, sqlText } from '../../scripts/local-stack';
import { cleanBookletPdf, handWrittenPdf } from '../fixtures/pdf';
import { iphoneHeicPhoto, jpegPhoto } from '../fixtures/uploads';

// The upload pipeline against the real Storage and database of the local stack (docs/Security.md §8.4): a URL
// signed by the service role, the file put in quarantine with it the way the browser does, then finalize reading
// it back, checking it, writing public-media and recording refusals. The routes' guards are covered by their
// unit tests; this proves the Storage calls behave as the service expects.
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () =>
    createClient(localStack().apiUrl, localStack().serviceRoleKey, {
      auth: { persistSession: false },
    }),
}));

const SLOW_HOOK_MS = 60_000;
// Each case re-encodes or scans a real file and makes several Storage calls, slower than the default on Windows.
const SLOW_TEST_MS = 30_000;
const BOOKLET_ID = '00000000-0000-4000-9000-0000000b0011';
const PAGED_BOOKLET_ID = '00000000-0000-4000-9000-0000000b0013';
const SANITIZED_BOOKLET_ID = '00000000-0000-4000-9000-0000000b0014';
const idRowsSchema = z.array(z.object({ id: z.string() }));

let officer: StaffContext;
const publishedPaths: string[] = [];

function serviceRole() {
  return createClient(localStack().apiUrl, localStack().serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function browser() {
  return createClient(localStack().apiUrl, localStack().anonKey, {
    auth: { persistSession: false },
  });
}

// Signs as the RW 05 officer and puts `bytes` into quarantine through the signed URL, declared as `contentType`.
async function quarantined(
  bytes: Buffer,
  contentType: string,
  signedAs = bytes,
): Promise<QuarantineUpload> {
  const signed = await signUpload(officer, {
    rwId: 5,
    contentType,
    size: bytes.length,
    leadingBytes: signedAs.subarray(0, LEADING_BYTES_LENGTH).toString('base64'),
  });
  if (!signed.ok) throw new Error(`sign refused the fixture: ${signed.problem}`);
  const { error } = await browser()
    .storage.from('uploads-quarantine')
    .uploadToSignedUrl(signed.data.path, signed.data.token, bytes, { contentType });
  if (error) throw error;
  const upload = parseQuarantinePath(signed.data.path);
  if (!upload) throw new Error('sign returned a path finalize cannot read');
  return upload;
}

async function finalize(upload: QuarantineUpload, target: MediaTarget) {
  const outcome = await finalizeUpload(officer, upload, target);
  if (outcome.ok) publishedPaths.push(outcome.data.path);
  if (outcome.ok && outcome.data.kind === 'image' && outcome.data.thumbnailPath) {
    publishedPaths.push(outcome.data.thumbnailPath);
  }
  return outcome;
}

async function quarantineHas(upload: QuarantineUpload): Promise<boolean> {
  const admin = serviceRole();
  const { data } = await admin.storage
    .from('uploads-quarantine')
    .exists(`${upload.owner}/${upload.objectName}`);
  return data;
}

beforeAll(async () => {
  const rows = idRowsSchema.parse(
    await runSql(`select id::text from auth.users where email = 'admin-rw05@dev.gisikdrono.test'`),
  );
  const userId = rows[0]?.id;
  if (!userId) throw new Error('pnpm db:seed has not created the RW 05 officer');
  officer = { userId, role: 'admin_rw', rwId: 5, isAal2: true, totpVerifiedAt: null };
}, SLOW_HOOK_MS);

afterAll(async () => {
  const admin = serviceRole();
  if (publishedPaths.length > 0) await admin.storage.from('public-media').remove(publishedPaths);
  await runSql(`select set_config('app.purge', 'on', true);
    delete from public.security_events where event_type in ('upload_rejected', 'upload_sanitized') and actor_id = ${sqlText(officer.userId)};
    delete from public.rate_limit_buckets where key = ${sqlText(`upload_sign:${officer.userId}`)};`);
}, SLOW_HOOK_MS);

describe('upload pipeline on the local stack', { timeout: SLOW_TEST_MS }, () => {
  it('publishes a photo as WebP with its thumbnail and empties the quarantine', async () => {
    const upload = await quarantined(await jpegPhoto(2000, 1500), 'image/jpeg');

    const outcome = await finalize(upload, { purpose: 'gallery' });

    expect(outcome).toMatchObject({ ok: true, data: { kind: 'image', width: 1600, height: 1200 } });
    if (!outcome.ok || outcome.data.kind !== 'image') return;
    const response = await fetch(
      `${localStack().apiUrl}/storage/v1/object/public/public-media/${outcome.data.path}`,
    );
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(
      (await sharp(Buffer.from(await response.arrayBuffer())).metadata()).exif,
    ).toBeUndefined();
    expect(await quarantineHas(upload)).toBe(false);
  });

  it('refuses a real HEIC photo that came in under a JPEG name, records it and deletes it', async () => {
    const jpeg = await jpegPhoto();
    const upload = await quarantined(iphoneHeicPhoto(), 'image/jpeg', jpeg);

    const outcome = await finalize(upload, { purpose: 'gallery' });

    expect(outcome).toMatchObject({ ok: false, problem: 'heic' });
    expect(await quarantineHas(upload)).toBe(false);
    const events =
      await runSql(`select severity, details->>'reason' as reason from public.security_events
      where event_type = 'upload_rejected' and entity_id = ${sqlText(upload.objectName)}`);
    expect(events).toEqual([{ severity: 'info', reason: 'heic' }]);
  });

  it('publishes a clean booklet PDF once and never over itself', async () => {
    const pdf = Buffer.from(await cleanBookletPdf());
    const target: MediaTarget = { purpose: 'booklet', entityId: BOOKLET_ID };

    const first = await finalize(await quarantined(pdf, 'application/pdf'), target);
    const secondUpload = await quarantined(pdf, 'application/pdf');

    expect(first).toMatchObject({ ok: true, data: { kind: 'pdf', pageCount: 2 } });
    await expect(finalizeUpload(officer, secondUpload, target)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    // A refusal on our side leaves the file for the hourly purge; the test clears it itself.
    await serviceRole()
      .storage.from('uploads-quarantine')
      .remove([`rw-05/${secondUpload.objectName}`]);
  });

  it('refuses a booklet with a hex-escaped open action', async () => {
    const pdf = handWrittenPdf('/Open#41ction << /S /JavaScript /JS (app.alert(1)) >>');

    const outcome = await finalize(await quarantined(pdf, 'application/pdf'), {
      purpose: 'booklet',
      entityId: '00000000-0000-4000-9000-0000000b0012',
    });

    expect(outcome).toMatchObject({ ok: false, problem: 'pdf_active_content' });
  });

  it('leaves out an /OpenAction that only opens a page and records upload_sanitized', async () => {
    const pdf = handWrittenPdf('/OpenAction [3 0 R /Fit]');
    const upload = await quarantined(pdf, 'application/pdf');

    const outcome = await finalize(upload, { purpose: 'booklet', entityId: SANITIZED_BOOKLET_ID });

    expect(outcome).toMatchObject({ ok: true, sanitized: 'destination' });
    const events = await runSql(`select severity, details->>'removed' as removed,
        details->>'kind' as kind
      from public.security_events
      where event_type = 'upload_sanitized' and entity_id = ${sqlText(upload.objectName)}`);
    expect(events).toEqual([{ severity: 'info', removed: 'OpenAction', kind: 'destination' }]);
  });

  it('signs every page of a published booklet at once and publishes each as its own page', async () => {
    const pdf = Buffer.from(await cleanBookletPdf());
    await finalize(await quarantined(pdf, 'application/pdf'), {
      purpose: 'booklet',
      entityId: PAGED_BOOKLET_ID,
    });

    const signed = await signBookletPages(officer, { rwId: 5, bookletId: PAGED_BOOKLET_ID });
    if (!signed.ok) throw new Error(`sign-pages refused: ${signed.problem}`);
    expect(signed.data.pageCount).toBe(2);

    const page = await jpegPhoto(1131, 1600);
    const published: string[] = [];
    for (const slot of signed.data.pages) {
      const { error } = await browser()
        .storage.from('uploads-quarantine')
        .uploadToSignedUrl(slot.path, slot.token, page, { contentType: 'image/jpeg' });
      if (error) throw error;
      const upload = parseQuarantinePath(slot.path);
      if (!upload) throw new Error('sign-pages returned a path finalize cannot read');
      const outcome = await finalize(upload, { purpose: 'booklet-page' });
      if (outcome.ok) published.push(outcome.data.path);
    }

    expect(published).toEqual([
      `rw-05/booklets/${PAGED_BOOKLET_ID}/pages/0001.webp`,
      `rw-05/booklets/${PAGED_BOOKLET_ID}/pages/0002.webp`,
    ]);
  });

  it('signs no pages for a booklet whose PDF was never published', async () => {
    await expect(
      signBookletPages(officer, { rwId: 5, bookletId: '00000000-0000-4000-9000-0000000b0015' }),
    ).resolves.toEqual({ ok: false, problem: 'booklet_missing' });
  });
});
