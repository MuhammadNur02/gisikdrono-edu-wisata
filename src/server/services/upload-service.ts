import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  BOOKLET_PDF_TYPE,
  MAX_BOOKLET_PAGES,
  PUBLIC_MEDIA_BUCKET,
  PUBLIC_MEDIA_CACHE_SECONDS,
  QUARANTINE_BUCKET,
  SIGNED_UPLOAD_WINDOW_SECONDS,
  UPLOAD_SIGN_LIMIT_PER_HOUR,
} from '@/config/uploads';
import type { EnumValue } from '@/db/enums';
import { svcRateLimitHit } from '@/db/rpc';
import type { Database } from '@/db/types';
import { AppError } from '@/lib/errors';
import { reencodeImage, thumbnailOf } from '@/lib/images/re-encode';
// The service role is needed because no API role holds a Storage policy (0006, docs/Security.md §6.8): only
// the server may sign an upload into uploads-quarantine, read it back, and write public-media, so nothing
// reaches the public site without the checks below. Every call acts on a path this module built or parsed
// from a name the server issued, after checkUploadAccess confirmed the officer may upload for that owner.
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkUploadedFile, checkUploadRequest } from '@/lib/uploads/inspect';
import { refusalSeverity, type UploadRefusalReason } from '@/lib/uploads/outcomes';
import {
  bookletPageObjectName,
  bookletPdfPath,
  isPdfPurpose,
  publicMediaPathFor,
  quarantinePathFor,
  thumbnailPathFor,
  type MediaTarget,
  type QuarantineUpload,
} from '@/lib/uploads/paths';
import type { OpenActionKind } from '@/lib/uploads/pdf-open-action';
import { countPublishedPages, scanBookletPdf } from '@/lib/uploads/pdf-scan';
import { createUuidV7 } from '@/lib/utils/uuid-v7';
import type { SignBookletPagesInput, SignUploadInput } from '@/lib/validations/upload';
import { hasUploadAccess, type StaffContext } from '@/server/auth/guards';
import type {
  FinalizedUpload,
  SignedBookletPages,
  SignedUpload,
  UploadProblem,
} from '@/types/upload';

type DatabaseClient = SupabaseClient<Database>;

// A refused file is a business outcome (CLAUDE.md §4 rule 8), returned rather than thrown. `sanitized` says
// what a published booklet copy left out.
export type UploadOutcome<T> =
  | { ok: true; data: T; sanitized?: OpenActionKind | null }
  | { ok: false; problem: UploadProblem; detail?: string | null };

type UploadEvent = {
  type: 'upload_rejected' | 'upload_sanitized';
  severity: EnumValue<'alert_severity'>;
  rwId: number | null;
  objectName?: string;
  details: Record<string, string | null>;
};

const SECONDS_PER_HOUR = 3600;
const MS_PER_SECOND = 1000;
const NOT_FOUND = '404';
const ALREADY_EXISTS = '409';

function storageStatusOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'statusCode' in error
    ? String(error.statusCode)
    : undefined;
}

// docs/Security.md §11.1: ids and reasons only, never file names or links.
async function writeUploadEvent(
  adminClient: DatabaseClient,
  ctx: StaffContext,
  event: UploadEvent,
) {
  const details = { aal: ctx.isAal2 ? 'aal2' : 'aal1', ...event.details };
  const { error } = await adminClient.from('security_events').insert({
    event_type: event.type,
    severity: event.severity,
    actor_id: ctx.userId,
    actor_role: ctx.role,
    rw_id: event.rwId,
    entity_type: 'upload',
    entity_id: event.objectName ?? null,
    details,
  });
  if (error) throw error;
}

function refusalEvent(rwId: number | null, reason: UploadRefusalReason): UploadEvent {
  return { type: 'upload_rejected', severity: refusalSeverity(reason), rwId, details: { reason } };
}

// A signed-in officer asking for an RW they may not upload for, or without a TOTP check, is recorded as
// upload_rejected before the refusal (docs/Security.md UPL-04).
export async function checkUploadAccess(
  ctx: StaffContext,
  rwId: number | null,
  details: Record<string, string>,
): Promise<boolean> {
  if (hasUploadAccess(ctx, rwId)) return true;
  const event = refusalEvent(rwId, 'forbidden');
  await writeUploadEvent(createSupabaseAdminClient(), ctx, {
    ...event,
    details: { ...event.details, ...details },
  });
  return false;
}

// docs/Security.md §8.3: 60 signatures per staff member per hour; a whole booklet's pages count as one.
async function countSignature(adminClient: DatabaseClient, ctx: StaffContext): Promise<void> {
  const isAllowed = await svcRateLimitHit(adminClient, {
    key: `upload_sign:${ctx.userId}`,
    limit: UPLOAD_SIGN_LIMIT_PER_HOUR,
    windowSeconds: SECONDS_PER_HOUR,
  });
  if (!isAllowed) throw new AppError('RATE_LIMITED');
}

async function signedUploadToken(adminClient: DatabaseClient, path: string): Promise<string> {
  const { data, error } = await adminClient.storage
    .from(QUARANTINE_BUCKET)
    .createSignedUploadUrl(path);
  if (error) throw error;
  return data.token;
}

export async function signUpload(
  ctx: StaffContext,
  input: SignUploadInput,
  nowMs: number = Date.now(),
): Promise<UploadOutcome<SignedUpload>> {
  const adminClient = createSupabaseAdminClient();
  await countSignature(adminClient, ctx);
  const check = await checkUploadRequest({
    contentType: input.contentType,
    size: input.size,
    leadingBytes: Buffer.from(input.leadingBytes, 'base64'),
  });
  if ('problem' in check) return { ok: false, problem: check.problem };

  const path = quarantinePathFor(input.rwId, createUuidV7(nowMs));
  return { ok: true, data: { path, token: await signedUploadToken(adminClient, path) } };
}

// The pages of the PDF finalize published under this booklet in this owner's prefix, or null when there is
// none: the count comes from the checked file, never from the browser.
async function publishedPageCount(adminClient: DatabaseClient, input: SignBookletPagesInput) {
  const { data, error } = await adminClient.storage
    .from(PUBLIC_MEDIA_BUCKET)
    .download(bookletPdfPath(input.rwId, input.bookletId));
  if (storageStatusOf(error) === NOT_FOUND) return null;
  if (error) throw error;
  return countPublishedPages(new Uint8Array(await data.arrayBuffer()));
}

// api/uploads/sign-pages (docs/Security.md §8.4, decision of 2026-10-18): one signature covers every page, each
// URL bound to its page number and the page count in its object name, so finalize can make it that page only.
export async function signBookletPages(
  ctx: StaffContext,
  input: SignBookletPagesInput,
  nowMs: number = Date.now(),
): Promise<UploadOutcome<SignedBookletPages>> {
  const adminClient = createSupabaseAdminClient();
  await countSignature(adminClient, ctx);
  const pageCount = await publishedPageCount(adminClient, input);
  if (pageCount === null) return { ok: false, problem: 'booklet_missing' };
  if (pageCount > MAX_BOOKLET_PAGES) return { ok: false, problem: 'pdf_too_many_pages' };

  const pages: SignedBookletPages['pages'] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const slot = { bookletId: input.bookletId, pageNumber, pageCount };
    const path = quarantinePathFor(input.rwId, bookletPageObjectName(createUuidV7(nowMs), slot));
    pages.push({ pageNumber, path, token: await signedUploadToken(adminClient, path) });
  }
  return { ok: true, data: { pageCount, pages } };
}

// Published files are never replaced: a name already taken is a conflict, not an overwrite.
async function writePublicMedia(
  adminClient: DatabaseClient,
  path: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await adminClient.storage
    .from(PUBLIC_MEDIA_BUCKET)
    .upload(path, Buffer.from(body), {
      contentType,
      cacheControl: String(PUBLIC_MEDIA_CACHE_SECONDS),
      upsert: false,
    });
  if (storageStatusOf(error) === ALREADY_EXISTS) throw new AppError('CONFLICT');
  if (error) throw error;
}

async function publishImage(
  adminClient: DatabaseClient,
  bytes: Buffer,
  path: string,
  withThumbnail: boolean,
): Promise<UploadOutcome<FinalizedUpload>> {
  const image = await reencodeImage(bytes).catch(() => null);
  if (!image) return { ok: false, problem: 'unreadable' };

  await writePublicMedia(adminClient, path, image.webp, 'image/webp');
  const thumbnailPath = withThumbnail ? thumbnailPathFor(path) : null;
  if (thumbnailPath) {
    await writePublicMedia(adminClient, thumbnailPath, await thumbnailOf(image.webp), 'image/webp');
  }
  const { width, height, blurhash } = image;
  return { ok: true, data: { kind: 'image', path, width, height, blurhash, thumbnailPath } };
}

async function publishPdf(
  adminClient: DatabaseClient,
  bytes: Buffer,
  path: string,
): Promise<UploadOutcome<FinalizedUpload>> {
  const scan = await scanBookletPdf(bytes);
  if (!scan.ok) return { ok: false, problem: scan.problem, detail: scan.detail ?? null };

  await writePublicMedia(adminClient, path, scan.pdf, BOOKLET_PDF_TYPE);
  const data: FinalizedUpload = {
    kind: 'pdf',
    path,
    pageCount: scan.pageCount,
    fileSizeBytes: scan.pdf.byteLength,
  };
  return { ok: true, data, sanitized: scan.removedOpenAction };
}

// Reads the quarantine object, refuses it when it arrived after the five-minute window (Supabase keeps the
// signed URL itself alive for two hours), checks its bytes and publishes what it becomes.
async function processUpload(
  adminClient: DatabaseClient,
  upload: QuarantineUpload,
  target: MediaTarget,
): Promise<UploadOutcome<FinalizedUpload>> {
  const quarantine = adminClient.storage.from(QUARANTINE_BUCKET);
  const quarantinePath = quarantinePathFor(upload.rwId, upload.objectName);
  const info = await quarantine.info(quarantinePath);
  if (storageStatusOf(info.error) === NOT_FOUND) return { ok: false, problem: 'missing' };
  if (info.error) throw info.error;
  const lateByMs = Date.parse(info.data.createdAt) - upload.signedAtMs;
  if (lateByMs > SIGNED_UPLOAD_WINDOW_SECONDS * MS_PER_SECOND) {
    return { ok: false, problem: 'late' };
  }

  const { data: file, error } = await quarantine.download(quarantinePath);
  if (error) throw error;
  const bytes = Buffer.from(await file.arrayBuffer());
  const check = await checkUploadedFile(bytes, isPdfPurpose(target.purpose) ? 'pdf' : 'image');
  if ('problem' in check) return { ok: false, problem: check.problem, detail: check.type };

  const path = publicMediaPathFor(upload, target);
  if (check.kind === 'pdf') return publishPdf(adminClient, bytes, path);
  return publishImage(adminClient, bytes, path, target.purpose === 'gallery');
}

function outcomeEvent(
  outcome: UploadOutcome<FinalizedUpload>,
  upload: QuarantineUpload,
  target: MediaTarget,
): UploadEvent | null {
  const base = { rwId: upload.rwId, objectName: upload.objectName };
  if (!outcome.ok) {
    const event = refusalEvent(upload.rwId, outcome.problem);
    const details = { ...event.details, purpose: target.purpose, found: outcome.detail ?? null };
    return { ...event, ...base, details };
  }
  if (!outcome.sanitized) return null;
  const details = { removed: 'OpenAction', kind: outcome.sanitized, purpose: target.purpose };
  return { type: 'upload_sanitized', severity: 'info', ...base, details };
}

// The quarantine object goes once there is an answer either way; after a failure on our side it stays for
// a retry, and the hourly purge drops it after a day (docs/Security.md §6.8). A refusal is recorded as
// upload_rejected, a booklet whose copy left something out as upload_sanitized.
export async function finalizeUpload(
  ctx: StaffContext,
  upload: QuarantineUpload,
  target: MediaTarget,
): Promise<UploadOutcome<FinalizedUpload>> {
  const adminClient = createSupabaseAdminClient();
  const outcome = await processUpload(adminClient, upload, target);
  await adminClient.storage
    .from(QUARANTINE_BUCKET)
    .remove([quarantinePathFor(upload.rwId, upload.objectName)]);
  const event = outcomeEvent(outcome, upload, target);
  if (event) await writeUploadEvent(adminClient, ctx, event);
  return outcome;
}
