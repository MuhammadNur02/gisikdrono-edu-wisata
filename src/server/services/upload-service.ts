import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  BOOKLET_PDF_TYPE,
  PUBLIC_MEDIA_BUCKET,
  PUBLIC_MEDIA_CACHE_SECONDS,
  QUARANTINE_BUCKET,
  SIGNED_UPLOAD_WINDOW_SECONDS,
  UPLOAD_SIGN_LIMIT_PER_HOUR,
} from '@/config/uploads';
import type { EnumValue } from '@/db/enums';
import { svcRateLimitHit } from '@/db/rpc';
import type { Database } from '@/db/types';
import { copy } from '@/lib/copy/id';
import { AppError, fail } from '@/lib/errors';
import { reencodeImage, thumbnailOf } from '@/lib/images/re-encode';
// The service role is needed because no API role holds a Storage policy (0006, docs/Security.md §6.8): only
// the server may sign an upload into uploads-quarantine, read it back, and write public-media, so nothing
// reaches the public site without the checks below. Every call acts on a path this module built or parsed
// from `<owner>/<uuid v7>`, after the route checked the officer may upload for that owner (hasUploadAccess).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkUploadedFile, checkUploadRequest } from '@/lib/uploads/inspect';
import {
  isPdfPurpose,
  publicMediaPathFor,
  quarantinePathFor,
  thumbnailPathFor,
  type MediaTarget,
  type QuarantineUpload,
} from '@/lib/uploads/paths';
import { scanBookletPdf } from '@/lib/uploads/pdf-scan';
import { createUuidV7 } from '@/lib/utils/uuid-v7';
import type { SignUploadInput } from '@/lib/validations/upload';
import type { StaffContext } from '@/server/auth/guards';
import type { ActionFailure } from '@/types/action-result';
import type { FinalizedUpload, SignedUpload, UploadProblem } from '@/types/upload';

type DatabaseClient = SupabaseClient<Database>;

// A refused file is a business outcome (CLAUDE.md §4 rule 8), returned rather than thrown.
export type UploadOutcome<T> =
  { ok: true; data: T } | { ok: false; problem: UploadProblem; detail?: string | null };

// What the uploader shows: the problem's own Indonesian message.
export function failureFor(problem: UploadProblem): ActionFailure {
  const code = problem === 'missing' ? 'NOT_FOUND' : 'VALIDATION';
  return fail(code, undefined, copy.uploads.problems[problem]);
}

const SECONDS_PER_HOUR = 3600;
const MS_PER_SECOND = 1000;
const NOT_FOUND = '404';
const ALREADY_EXISTS = '409';
// A refusal that only a hand-made request or a doctored file produces; the rest are honest mistakes.
const SUSPICIOUS_PROBLEMS: ReadonlySet<UploadProblem> = new Set([
  'svg',
  'pdf_active_content',
  'pdf_link',
]);

function storageStatusOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'statusCode' in error
    ? String(error.statusCode)
    : undefined;
}

// docs/Security.md §8.3: 60 signed upload URLs per staff member per hour.
export async function signUpload(
  ctx: StaffContext,
  input: SignUploadInput,
  nowMs: number = Date.now(),
): Promise<UploadOutcome<SignedUpload>> {
  const adminClient = createSupabaseAdminClient();
  const isAllowed = await svcRateLimitHit(adminClient, {
    key: `upload_sign:${ctx.userId}`,
    limit: UPLOAD_SIGN_LIMIT_PER_HOUR,
    windowSeconds: SECONDS_PER_HOUR,
  });
  if (!isAllowed) throw new AppError('RATE_LIMITED');

  const check = await checkUploadRequest({
    contentType: input.contentType,
    size: input.size,
    leadingBytes: Buffer.from(input.leadingBytes, 'base64'),
  });
  if ('problem' in check) return { ok: false, problem: check.problem };

  const path = quarantinePathFor(input.rwId, createUuidV7(nowMs));
  const { data, error } = await adminClient.storage
    .from(QUARANTINE_BUCKET)
    .createSignedUploadUrl(path);
  if (error) throw error;
  return { ok: true, data: { path, token: data.token } };
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
  return {
    ok: true,
    data: { kind: 'pdf', path, pageCount: scan.pageCount, fileSizeBytes: scan.pdf.byteLength },
  };
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
  if (lateByMs > SIGNED_UPLOAD_WINDOW_SECONDS * MS_PER_SECOND)
    return { ok: false, problem: 'late' };

  const { data: file, error } = await quarantine.download(quarantinePath);
  if (error) throw error;
  const bytes = Buffer.from(await file.arrayBuffer());
  const check = await checkUploadedFile(bytes, isPdfPurpose(target.purpose) ? 'pdf' : 'image');
  if ('problem' in check) return { ok: false, problem: check.problem, detail: check.type };

  const path = publicMediaPathFor(upload, target);
  if (check.kind === 'pdf') return publishPdf(adminClient, bytes, path);
  return publishImage(adminClient, bytes, path, target.purpose === 'gallery');
}

export type UploadRefusal = {
  rwId: number | null;
  // 'forbidden': a signed-in staff member asked for another RW's prefix, or without a TOTP check.
  reason: UploadProblem | 'forbidden';
  objectName?: string;
  details?: Record<string, string | null>;
};

function severityOf(reason: UploadRefusal['reason']): EnumValue<'alert_severity'> {
  if (reason === 'forbidden') return 'high';
  return SUSPICIOUS_PROBLEMS.has(reason) ? 'medium' : 'info';
}

// The upload_rejected security event (docs/Security.md §8.4, §10): ids and reasons only, never file names.
export async function recordUploadRefusal(
  ctx: StaffContext,
  refusal: UploadRefusal,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<void> {
  const { error } = await adminClient.from('security_events').insert({
    event_type: 'upload_rejected',
    severity: severityOf(refusal.reason),
    actor_id: ctx.userId,
    actor_role: ctx.role,
    rw_id: refusal.rwId,
    entity_type: 'upload',
    entity_id: refusal.objectName ?? null,
    details: { reason: refusal.reason, aal: ctx.isAal2 ? 'aal2' : 'aal1', ...refusal.details },
  });
  if (error) throw error;
}

// The quarantine object goes once there is an answer either way; after a failure on our side it stays for
// a retry, and the hourly purge drops it after a day (docs/Security.md §6.8).
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
  if (!outcome.ok) {
    const refusal: UploadRefusal = {
      rwId: upload.rwId,
      reason: outcome.problem,
      objectName: upload.objectName,
      details: { purpose: target.purpose, found: outcome.detail ?? null },
    };
    await recordUploadRefusal(ctx, refusal, adminClient);
  }
  return outcome;
}
