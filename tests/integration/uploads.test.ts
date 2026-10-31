import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { LEADING_BYTES_LENGTH } from '@/config/uploads';
import { parseQuarantinePath, type MediaTarget, type QuarantineUpload } from '@/lib/uploads/paths';
import type { StaffContext } from '@/server/auth/guards';
import {
  checkUploadAccess,
  finalizeUpload,
  signBookletPages,
  signUpload,
} from '@/server/services/upload-service';

import { localStack, runSql, sqlText } from '../../scripts/local-stack';
import { cleanBookletPdf, handWrittenPdf } from '../fixtures/pdf';
import { iphoneHeicPhoto, jpegPhoto } from '../fixtures/uploads';

// The upload pipeline against the real Storage and database of the local stack (docs/Security.md §8.4): a URL
// signed by the service role, the file put in quarantine with it the way the browser does, then finalize reading
// it back, checking it, writing public-media and recording refusals. The routes' guards are covered by their
// unit tests; this proves the Storage calls behave as the service expects, the single use of a signed URL and the
// lock on a booklet's pages included (security review of PR #14, L6 and L11).
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () =>
    createClient(localStack().apiUrl, localStack().serviceRoleKey, {
      auth: { persistSession: false },
    }),
}));
// Each Vercel instance has its own two scan slots, so requests from several instances meet only at the claim in the
// database. The races below run every request as if it came from its own instance; the slots have unit tests.
vi.mock('@/lib/uploads/scan-slots', () => ({
  withScanSlot: async <T>(scan: () => Promise<T>) => ({ ok: true, value: await scan() }),
}));

const SLOW_HOOK_MS = 60_000;
// Each case re-encodes or scans a real file and makes several Storage calls, slower than the default on Windows.
const SLOW_TEST_MS = 30_000;
const BOOKLET_ID = '00000000-0000-4000-9000-0000000b0011';
const PAGED_BOOKLET_ID = '00000000-0000-4000-9000-0000000b0013';
const SANITIZED_BOOKLET_ID = '00000000-0000-4000-9000-0000000b0014';
const LOCKED_BOOKLET_ID = '00000000-0000-4000-9000-0000000b0016';
const RACED_BOOKLET_ID = '00000000-0000-4000-9000-0000000b0017';
const CLAIMED_BOOKLET_IDS = [PAGED_BOOKLET_ID, LOCKED_BOOKLET_ID, RACED_BOOKLET_ID];
// More requests at once than a browser would ever send, so a race that lets two through would show.
const RACING_REQUESTS = 8;
const officerSchema = z.array(z.object({ id: z.string(), claims_version: z.number() }));

let officer: StaffContext;
const publishedPaths: string[] = [];
const quarantinePaths: string[] = [];

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

// `upsert` is what a browser holding the token may ask for; Storage decides from the token, not from the request.
async function putWithSignedUrl(
  path: string,
  token: string,
  bytes: Buffer,
  contentType: string,
  upsert = false,
) {
  quarantinePaths.push(path);
  return browser()
    .storage.from('uploads-quarantine')
    .uploadToSignedUrl(path, token, bytes, { contentType, upsert });
}

// Signs as the RW 05 officer and puts `bytes` into quarantine through the signed URL, declared as `contentType`.
async function quarantined(
  bytes: Buffer,
  contentType: string,
  signedAs = bytes,
): Promise<QuarantineUpload & { token: string }> {
  const signed = await signUpload(officer, {
    rwId: 5,
    contentType,
    size: bytes.length,
    leadingBytes: signedAs.subarray(0, LEADING_BYTES_LENGTH).toString('base64'),
  });
  if (!signed.ok) throw new Error(`sign refused the fixture: ${signed.problem}`);
  const { error } = await putWithSignedUrl(signed.data.path, signed.data.token, bytes, contentType);
  if (error) throw error;
  const upload = parseQuarantinePath(signed.data.path);
  if (!upload) throw new Error('sign returned a path finalize cannot read');
  return { ...upload, token: signed.data.token };
}

async function finalize(upload: QuarantineUpload, target: MediaTarget) {
  const outcome = await finalizeUpload(officer, upload, target);
  if (outcome.ok) publishedPaths.push(outcome.data.path);
  if (outcome.ok && outcome.data.kind === 'image' && outcome.data.thumbnailPath) {
    publishedPaths.push(outcome.data.thumbnailPath);
  }
  return outcome;
}

// The quarantine object's size: null when nothing is there, 0 for the tombstone finalize leaves.
async function quarantineSize(upload: QuarantineUpload): Promise<number | null> {
  const { data } = await serviceRole()
    .storage.from('uploads-quarantine')
    .info(`${upload.owner}/${upload.objectName}`);
  return data ? (data.size ?? null) : null;
}

beforeAll(async () => {
  const rows = officerSchema.parse(
    await runSql(`select p.id::text, p.claims_version from public.profiles p
      join auth.users u on u.id = p.id where u.email = 'admin-rw05@dev.gisikdrono.test'`),
  );
  const row = rows[0];
  if (!row) throw new Error('pnpm db:seed has not created the RW 05 officer');
  officer = {
    userId: row.id,
    role: 'admin_rw',
    rwId: 5,
    isAal2: true,
    totpVerifiedAt: null,
    claimsVersion: row.claims_version,
  };
}, SLOW_HOOK_MS);

afterAll(async () => {
  const admin = serviceRole();
  if (publishedPaths.length > 0) await admin.storage.from('public-media').remove(publishedPaths);
  await admin.storage.from('uploads-quarantine').remove(quarantinePaths);
  const claimed = CLAIMED_BOOKLET_IDS.map((id) => sqlText(id)).join(', ');
  await runSql(`select set_config('app.purge', 'on', true);
    delete from public.booklet_page_claims where booklet_id in (${claimed});
    delete from public.security_events where event_type in ('upload_rejected', 'upload_sanitized', 'rate_limited') and actor_id = ${sqlText(officer.userId)};
    delete from public.rate_limit_buckets where key like 'upload%' and key like ${sqlText(`%:${officer.userId}`)};`);
}, SLOW_HOOK_MS);

describe('upload pipeline on the local stack', { timeout: SLOW_TEST_MS }, () => {
  it('publishes a photo as WebP with its thumbnail and leaves an empty tombstone', async () => {
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
    expect(await quarantineSize(upload)).toBe(0);
  });

  it('uses a signed URL once: the token cannot refill the path and finalize refuses it again', async () => {
    const upload = await quarantined(await jpegPhoto(), 'image/jpeg');
    await finalize(upload, { purpose: 'gallery' });

    const path = `${upload.owner}/${upload.objectName}`;
    const reuse = await putWithSignedUrl(path, upload.token, await jpegPhoto(), 'image/jpeg');

    expect(reuse.error).not.toBeNull();
    await expect(finalize(upload, { purpose: 'gallery' })).resolves.toEqual({
      ok: false,
      problem: 'already_used',
    });
  });

  // Security review of PR #14, N5: a browser holding the token cannot ask Storage to overwrite.
  it('refuses a reused token that asks for upsert: true, and keeps the empty tombstone', async () => {
    const upload = await quarantined(await jpegPhoto(), 'image/jpeg');
    await finalize(upload, { purpose: 'gallery' });

    const path = `${upload.owner}/${upload.objectName}`;
    const reuse = await putWithSignedUrl(path, upload.token, await jpegPhoto(), 'image/jpeg', true);

    expect(reuse.error).not.toBeNull();
    expect(await quarantineSize(upload)).toBe(0);
    await expect(finalize(upload, { purpose: 'gallery' })).resolves.toEqual({
      ok: false,
      problem: 'already_used',
    });
  });

  it('refuses upsert: true before finalize too, so the file that arrived in time is the one published', async () => {
    const upload = await quarantined(await jpegPhoto(800, 600), 'image/jpeg');

    const path = `${upload.owner}/${upload.objectName}`;
    const swap = await putWithSignedUrl(
      path,
      upload.token,
      await jpegPhoto(40, 30),
      'image/jpeg',
      true,
    );
    const outcome = await finalize(upload, { purpose: 'gallery' });

    expect(swap.error).not.toBeNull();
    expect(outcome).toMatchObject({ ok: true, data: { width: 800, height: 600 } });
  });

  it('refuses a real HEIC photo that came in under a JPEG name, records it and empties it', async () => {
    const jpeg = await jpegPhoto();
    const upload = await quarantined(iphoneHeicPhoto(), 'image/jpeg', jpeg);

    const outcome = await finalize(upload, { purpose: 'gallery' });

    expect(outcome).toMatchObject({ ok: false, problem: 'heic' });
    expect(await quarantineSize(upload)).toBe(0);
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
    expect(await quarantineSize(secondUpload)).toBe(0);
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

    expect(outcome).toMatchObject({
      ok: true,
      sanitized: { openAction: 'destination', annotations: 0 },
    });
    const events = await runSql(`select severity, details->>'removed' as removed,
        details->>'kind' as kind
      from public.security_events
      where event_type = 'upload_sanitized' and entity_id = ${sqlText(upload.objectName)}`);
    expect(events).toEqual([{ severity: 'info', removed: 'OpenAction', kind: 'destination' }]);
  });

  it('signs every page once, takes them all into quarantine, then publishes them one by one', async () => {
    const pdf = Buffer.from(await cleanBookletPdf());
    await finalize(await quarantined(pdf, 'application/pdf'), {
      purpose: 'booklet',
      entityId: PAGED_BOOKLET_ID,
    });

    const signed = await signBookletPages(officer, { rwId: 5, bookletId: PAGED_BOOKLET_ID });
    if (!signed.ok) throw new Error(`sign-pages refused: ${signed.problem}`);
    expect(signed.data.pageCount).toBe(2);
    const page = await jpegPhoto(1131, 1600);
    const uploads = await Promise.all(
      signed.data.pages.map((slot) => putWithSignedUrl(slot.path, slot.token, page, 'image/jpeg')),
    );
    expect(uploads.map((result) => result.error)).toEqual([null, null]);
    const published: string[] = [];
    for (const slot of signed.data.pages) {
      const upload = parseQuarantinePath(slot.path);
      if (!upload) throw new Error('sign-pages returned a path finalize cannot read');
      const outcome = await finalize(upload, { purpose: 'booklet-page' });
      if (outcome.ok) published.push(outcome.data.path);
    }

    expect(published).toEqual([
      `rw-05/booklets/${PAGED_BOOKLET_ID}/pages/0001.webp`,
      `rw-05/booklets/${PAGED_BOOKLET_ID}/pages/0002.webp`,
    ]);
    await expect(
      signBookletPages(officer, { rwId: 5, bookletId: PAGED_BOOKLET_ID }),
    ).resolves.toEqual({ ok: false, problem: 'booklet_pages_exist' });
  });

  it('refuses a second sign-pages while the first one’s URLs are alive', async () => {
    const pdf = Buffer.from(await cleanBookletPdf());
    await finalize(await quarantined(pdf, 'application/pdf'), {
      purpose: 'booklet',
      entityId: LOCKED_BOOKLET_ID,
    });

    const first = await signBookletPages(officer, { rwId: 5, bookletId: LOCKED_BOOKLET_ID });
    const second = await signBookletPages(officer, { rwId: 5, bookletId: LOCKED_BOOKLET_ID });

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, problem: 'booklet_pages_in_progress' });
  });

  // Security review of PR #14, N4: the claim is one conditional write, so requests at the same moment cannot share it.
  it('lets exactly one of several simultaneous sign-pages requests through', async () => {
    const pdf = Buffer.from(await cleanBookletPdf());
    await finalize(await quarantined(pdf, 'application/pdf'), {
      purpose: 'booklet',
      entityId: RACED_BOOKLET_ID,
    });

    const answers = await Promise.all(
      Array.from({ length: RACING_REQUESTS }, () =>
        signBookletPages(officer, { rwId: 5, bookletId: RACED_BOOKLET_ID }),
      ),
    );

    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.filter((answer) => !answer.ok)).toEqual(
      Array.from({ length: RACING_REQUESTS - 1 }, () => ({
        ok: false,
        problem: 'booklet_pages_in_progress',
      })),
    );
  });

  it('lets exactly one through when they race to take over a claim whose URLs have expired', async () => {
    // The Storage lock this replaced removed a stale lock and placed a new one in two steps, so two requests could
    // both pass here; the conditional update cannot.
    await runSql(`update public.booklet_page_claims set claimed_at = now() - interval '3 hours'
      where booklet_id = ${sqlText(RACED_BOOKLET_ID)}`);

    const answers = await Promise.all(
      Array.from({ length: RACING_REQUESTS }, () =>
        signBookletPages(officer, { rwId: 5, bookletId: RACED_BOOKLET_ID }),
      ),
    );

    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
  });

  it('signs no pages for a booklet whose PDF was never published', async () => {
    await expect(
      signBookletPages(officer, { rwId: 5, bookletId: '00000000-0000-4000-9000-0000000b0015' }),
    ).resolves.toEqual({ ok: false, problem: 'booklet_missing' });
  });

  it('reads the profile itself: a token from before the last profile change is refused', async () => {
    await expect(checkUploadAccess(officer, 5, { step: 'sign' }, null)).resolves.toBe(true);
    const staleToken = { ...officer, claimsVersion: (officer.claimsVersion ?? 0) - 1 };

    await expect(checkUploadAccess(staleToken, 5, { step: 'sign' }, null)).resolves.toBe(false);
  });
});
