import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { RwId } from '@/config/rw';
import {
  PUBLIC_MEDIA_BUCKET,
  QUARANTINE_BUCKET,
  SIGNED_UPLOAD_TOKEN_SECONDS,
  SIGNED_UPLOAD_WINDOW_SECONDS,
} from '@/config/uploads';
import { svcClaimBookletPages } from '@/db/rpc';
import type { Database } from '@/db/types';
import { AppError } from '@/lib/errors';
// The service role is needed because no API role holds a Storage policy (0006, docs/Security.md §6.8): only
// the server may sign an upload into uploads-quarantine, read it back, and write public-media, so nothing
// reaches the public site without the checks below. Every call acts on a path this module built or parsed
// from a name the server issued, after checkUploadAccess confirmed against the profile itself that the officer
// may upload for that owner.
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkUploadedFile, checkUploadRequest, sizeProblem } from '@/lib/uploads/inspect';
import {
  bookletPageObjectName,
  bookletPdfPath,
  isPdfPurpose,
  publicMediaPathFor,
  quarantinePathFor,
  type MediaTarget,
  type QuarantineUpload,
} from '@/lib/uploads/paths';
import { countPublishedPages, type PdfSanitizing } from '@/lib/uploads/pdf-scan';
import { withScanSlot } from '@/lib/uploads/scan-slots';
import { createUuidV7 } from '@/lib/utils/uuid-v7';
import type { SignBookletPagesInput, SignUploadInput } from '@/lib/validations/upload';
import { hasUploadAccess, type StaffContext } from '@/server/auth/guards';
import {
  keepOnlyRowPhotos,
  readPublishedBooklet,
  removeBookletFolder,
  removeUnusedGalleryFiles,
  removeUnusedHeroFiles,
  type RowPhotos,
  type PublishedBooklet,
} from '@/server/services/media-library';
import {
  refusalEvent,
  sanitizedEvent,
  withinUploadLimit,
  writeUploadEvent,
  type UploadEvent,
} from '@/server/services/upload-events';
import { publishImage, publishPdf } from '@/server/services/upload-publish';
import {
  hasPublishedPages,
  publicObjectExists,
  quarantineObject,
  retireQuarantineObject,
  downloadObject,
  type QuarantineObject,
} from '@/server/services/upload-storage';
import type {
  FinalizedUpload,
  SignedBookletPages,
  SignedUpload,
  UploadKind,
  UploadProblem,
} from '@/types/upload';

type DatabaseClient = SupabaseClient<Database>;

// A refused file is a business outcome (CLAUDE.md §4 rule 8), returned rather than thrown. `sanitized` says
// what a published booklet copy left out.
export type UploadOutcome<T> =
  | { ok: true; data: T; sanitized?: PdfSanitizing }
  | { ok: false; problem: UploadProblem; detail?: string | null };

const MS_PER_SECOND = 1000;
// Nothing arrived, or the path holds an empty tombstone already: nothing for finalize to retire.
const NOTHING_TO_RETIRE: ReadonlySet<UploadProblem> = new Set(['missing', 'already_used']);

// The profile as it is now (security review of PR #14, L9): RLS, which would hold a deactivated officer or one
// moved to another RW to the profile, does not apply to the service role, so the profile is read here.
async function currentStaff(adminClient: DatabaseClient, ctx: StaffContext) {
  const { data, error } = await adminClient
    .from('profiles')
    .select('role, rw_id, is_active, claims_version')
    .eq('id', ctx.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.is_active || data.claims_version !== ctx.claimsVersion) return null;
  return { ...ctx, role: data.role, rwId: data.rw_id };
}

// A refused officer is recorded as upload_rejected, ten an hour at most; beyond that one rate_limited row stands
// for the rest (docs/Security.md UPL-04; security review of PR #14, L8).
// The RWs are rows of rw_units, so an RW number is only an upload owner if its row exists; otherwise public-media
// would collect files under a folder nobody owns (independent review of Task P2.10.02, L2).
async function isUploadOwner(adminClient: DatabaseClient, rwId: number | null): Promise<boolean> {
  if (rwId === null) return true;
  const { data, error } = await adminClient
    .from('rw_units')
    .select('id')
    .eq('id', rwId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

function refusalReason(isStaff: boolean, mayUpload: boolean, ctx: StaffContext): string {
  if (!isStaff) return 'profile';
  if (mayUpload) return 'rw';
  return ctx.isAal2 ? 'scope' : 'aal1';
}

export async function checkUploadAccess(
  ctx: StaffContext,
  rwId: number | null,
  details: Record<string, string>,
): Promise<boolean> {
  const adminClient = createSupabaseAdminClient();
  const current = await currentStaff(adminClient, ctx);
  const mayUpload = current !== null && hasUploadAccess(current, rwId);
  if (mayUpload && (await isUploadOwner(adminClient, rwId))) return true;
  if (await withinUploadLimit(adminClient, ctx, 'upload_forbidden', rwId)) {
    const why = refusalReason(current !== null, mayUpload, ctx);
    await writeUploadEvent(adminClient, ctx, refusalEvent(rwId, 'forbidden', { why, ...details }));
  }
  return false;
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
  if (!(await withinUploadLimit(adminClient, ctx, 'upload_sign', input.rwId))) {
    throw new AppError('RATE_LIMITED');
  }
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
  const path = bookletPdfPath(input.rwId, input.bookletId);
  const pdf = await downloadObject(adminClient, PUBLIC_MEDIA_BUCKET, path);
  return pdf && countPublishedPages(new Uint8Array(pdf));
}

async function signPages(
  adminClient: DatabaseClient,
  input: SignBookletPagesInput,
  pageCount: number,
  nowMs: number,
): Promise<SignedBookletPages['pages']> {
  const pages: SignedBookletPages['pages'] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const slot = { bookletId: input.bookletId, pageNumber, pageCount };
    const path = quarantinePathFor(input.rwId, bookletPageObjectName(createUuidV7(nowMs), slot));
    pages.push({ pageNumber, path, token: await signedUploadToken(adminClient, path) });
  }
  return pages;
}

// The claim first, then the download and the count of the published PDF, inside one of the process's scan slots.
async function claimAndSignPages(
  adminClient: DatabaseClient,
  ctx: StaffContext,
  input: SignBookletPagesInput,
  nowMs: number,
): Promise<UploadOutcome<SignedBookletPages>> {
  const claim = {
    bookletId: input.bookletId,
    rwId: input.rwId,
    actorId: ctx.userId,
    holdSeconds: SIGNED_UPLOAD_TOKEN_SECONDS,
  };
  if (!(await svcClaimBookletPages(adminClient, claim))) {
    return { ok: false, problem: 'booklet_pages_in_progress' };
  }
  const counted = await publishedPageCount(adminClient, input);
  if (counted === null) return { ok: false, problem: 'booklet_missing' };
  if (!counted.ok) return { ok: false, problem: counted.problem };
  const pages = await signPages(adminClient, input, counted.pageCount, nowMs);
  return { ok: true, data: { pageCount: counted.pageCount, pages } };
}

// api/uploads/sign-pages (docs/Security.md §8.4): one signature covers every page, each URL bound to its page number
// and the page count in its object name. A booklet gets it once: never again once a page is published, and not
// while another request's URLs are still alive. That claim is one conditional write in the database, so two
// requests at the same moment cannot both pass (security review of PR #14, L11 and N4). The cheap checks come
// first, the signature counted before anything else, and the download and parse of the published PDF last, inside
// a scan slot taken before the claim, so a busy server turns the request away without holding the booklet (F2).
export async function signBookletPages(
  ctx: StaffContext,
  input: SignBookletPagesInput,
  nowMs: number = Date.now(),
): Promise<UploadOutcome<SignedBookletPages>> {
  const adminClient = createSupabaseAdminClient();
  if (!(await withinUploadLimit(adminClient, ctx, 'upload_sign', input.rwId))) {
    throw new AppError('RATE_LIMITED');
  }
  if (await hasPublishedPages(adminClient, input.rwId, input.bookletId)) {
    return { ok: false, problem: 'booklet_pages_exist' };
  }
  const pdfPath = bookletPdfPath(input.rwId, input.bookletId);
  if (!(await publicObjectExists(adminClient, pdfPath))) {
    return { ok: false, problem: 'booklet_missing' };
  }
  const signed = await withScanSlot(() => claimAndSignPages(adminClient, ctx, input, nowMs));
  if (!signed.ok) throw new AppError('RATE_LIMITED');
  return signed.value;
}

// Why a quarantine object cannot be processed, read from Storage before a byte is downloaded: nothing arrived,
// it is a tombstone (L6), it arrived after the five-minute window, or it is larger than its kind allows (L1).
// The window is measured when the upload finished, not when finalize runs, and a time or size that cannot be
// read counts against the file (security review of PR #14, M2, L7).
function arrivalProblem(
  arrived: QuarantineObject | null,
  upload: QuarantineUpload,
  kind: UploadKind,
): UploadProblem | null {
  if (!arrived) return 'missing';
  if (arrived.size === 0) return 'already_used';
  const lateByMs = arrived.createdAtMs - upload.signedAtMs;
  const isLate =
    !Number.isFinite(lateByMs) || lateByMs > SIGNED_UPLOAD_WINDOW_SECONDS * MS_PER_SECOND;
  if (isLate) return 'late';
  return sizeProblem(kind, arrived.size ?? Number.POSITIVE_INFINITY);
}

async function processUpload(
  adminClient: DatabaseClient,
  upload: QuarantineUpload,
  target: MediaTarget,
): Promise<UploadOutcome<FinalizedUpload>> {
  const path = publicMediaPathFor(upload, target);
  // A booklet page already published answers CONFLICT, which the browser takes as done when it retries (M2).
  if (target.purpose === 'booklet-page' && (await publicObjectExists(adminClient, path))) {
    throw new AppError('CONFLICT');
  }
  const quarantinePath = quarantinePathFor(upload.rwId, upload.objectName);
  const kind = isPdfPurpose(target.purpose) ? 'pdf' : 'image';
  const arrived = await quarantineObject(adminClient, quarantinePath);
  const problem = arrivalProblem(arrived, upload, kind);
  if (problem) return { ok: false, problem };

  const bytes = await downloadObject(adminClient, QUARANTINE_BUCKET, quarantinePath);
  if (!bytes) return { ok: false, problem: 'missing' };
  if (bytes.length === 0) return { ok: false, problem: 'already_used' };
  const check = await checkUploadedFile(bytes, kind);
  if ('problem' in check) return { ok: false, problem: check.problem, detail: check.type };
  if (check.kind === 'pdf') return publishPdf(adminClient, bytes, path);
  return publishImage(adminClient, bytes, path, target.purpose === 'gallery');
}

function outcomeEvent(
  outcome: UploadOutcome<FinalizedUpload>,
  upload: QuarantineUpload,
  target: MediaTarget,
): UploadEvent | null {
  const event = outcome.ok
    ? outcome.sanitized && sanitizedEvent(upload.rwId, outcome.sanitized)
    : refusalEvent(upload.rwId, outcome.problem, { found: outcome.detail ?? null });
  if (!event) return null;
  const details = { ...event.details, purpose: target.purpose };
  return { ...event, objectName: upload.objectName, details };
}

// Every answer retires the quarantine object: its bytes are replaced by an empty tombstone, so the two-hour token
// cannot put a new file there and the same name is never finalized twice (security review of PR #14, L6). After a
// failure on our side it stays as it is for a retry, and the hourly purge drops it after a day.
export async function finalizeUpload(
  ctx: StaffContext,
  upload: QuarantineUpload,
  target: MediaTarget,
): Promise<UploadOutcome<FinalizedUpload>> {
  const adminClient = createSupabaseAdminClient();
  if (!(await withinUploadLimit(adminClient, ctx, 'upload_finalize', upload.rwId))) {
    throw new AppError('RATE_LIMITED');
  }
  const quarantinePath = quarantinePathFor(upload.rwId, upload.objectName);
  const outcome = await processUpload(adminClient, upload, target).catch(async (error: unknown) => {
    if (error instanceof AppError && error.code === 'CONFLICT') {
      await retireQuarantineObject(adminClient, quarantinePath);
    }
    throw error;
  });
  if (outcome.ok || !NOTHING_TO_RETIRE.has(outcome.problem)) {
    await retireQuarantineObject(adminClient, quarantinePath);
  }
  const event = outcomeEvent(outcome, upload, target);
  if (event) await writeUploadEvent(adminClient, ctx, event);
  return outcome;
}

// The CMS's own uses of public-media (Task P2.9.06), for an officer the profile still lets act for this owner.
async function mediaClientFor(ctx: StaffContext, rwId: RwId | null): Promise<DatabaseClient> {
  const adminClient = createSupabaseAdminClient();
  const current = await currentStaff(adminClient, ctx);
  if (!current || !hasUploadAccess(current, rwId)) throw new AppError('FORBIDDEN');
  return adminClient;
}

// A removed gallery item takes its photo and thumbnail along, and an RW page or a schedule the photo it stopped
// showing, unless another row still shows them (docs/PRD.md FR-ADMIN-10, docs/Security.md R34).
export async function removeGalleryFiles(
  ctx: StaffContext,
  rwId: RwId | null,
  paths: (string | null)[],
): Promise<string[]> {
  return removeUnusedGalleryFiles(await mediaClientFor(ctx, rwId), rwId, paths);
}

// The page count and size a booklet row keeps, as Storage holds them rather than as the form reported them.
export async function readPublishedBookletFiles(
  ctx: StaffContext,
  rwId: RwId | null,
  bookletId: string,
): Promise<PublishedBooklet | null> {
  return readPublishedBooklet(await mediaClientFor(ctx, rwId), rwId, bookletId);
}

// A booklet the superadmin removed takes its PDF and pages out of public-media, where their addresses would otherwise
// keep working.
export async function removeBookletFiles(
  ctx: StaffContext,
  rwId: RwId | null,
  bookletId: string,
): Promise<number> {
  return removeBookletFolder(await mediaClientFor(ctx, rwId), rwId, bookletId);
}

// An article's or activity point's folder keeps only what the row shows now, and nothing once it is removed. No
// other row can show those photos: the folder is the row's own.
export async function keepRowPhotos(
  ctx: StaffContext,
  target: RowPhotos,
  keep: string[],
): Promise<number> {
  return keepOnlyRowPhotos(await mediaClientFor(ctx, target.rwId), target, keep);
}

export async function removeRowPhotos(ctx: StaffContext, target: RowPhotos): Promise<number> {
  return keepRowPhotos(ctx, target, []);
}

// The kelurahan hero photos a banner stopped showing, once no banner shows them (docs/Security.md R34).
export async function removeUnusedHeroPhotos(
  ctx: StaffContext,
  paths: (string | null)[],
): Promise<string[]> {
  return removeUnusedHeroFiles(await mediaClientFor(ctx, null), paths);
}
