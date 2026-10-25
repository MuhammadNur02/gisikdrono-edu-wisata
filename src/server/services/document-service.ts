import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { QUARANTINE_BUCKET } from '@/config/uploads';
import { svcForgetPurgedFiles, svcIncrementBookletDownload, svcPurgeableFiles } from '@/db/rpc';
import type { PurgeableFile } from '@/db/rpc';
import type { Database } from '@/db/types';
import { AppError } from '@/lib/errors';
import { publicEnv } from '@/lib/public-env';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import { withinRateLimits } from '@/lib/rate-limit';
// See withinBookletDownloadLimit for why this module creates a service-role client.
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isMediaOwner } from '@/lib/uploads/paths';
import { rateLimitIpBucket } from '@/lib/utils/client-ip';
import {
  bookingDocumentPdf,
  loadBookingDocument,
  lookupVerifyCode,
  type BookingDocument,
  type BookingDocumentKind,
} from '@/server/services/booking-documents';
import {
  keptTicketPdfPath,
  loadTicketDocument,
  ticketDocumentPdf,
  type TicketDocument,
} from '@/server/services/ticket-documents';
import type { VerifiedDocument } from '@/types/documents';

type DatabaseClient = SupabaseClient<Database>;

export type PurgeReport = { processed: number; failed: number };

const PURGE_BATCH_SIZE = 200;
const MS_PER_HOUR = 3_600_000;
const QUARANTINE_MAX_AGE_HOURS = 24;
const DOCUMENTS_BUCKET = 'documents';

// How long a signed URL to a private document stays valid (docs/Security.md §10.3). The WhatsApp document
// header lives longest because Meta fetches the file some time after the message is queued.
export const SIGNED_URL_TTL_SECONDS = {
  ticket: 600,
  certificate: 600,
  invoice: 900,
  quotation: 900,
  receipt: 900,
  credit_note: 900,
  export: 300,
  whatsapp_document_header: 3600,
} as const;

export type SignedDocumentKind = keyof typeof SIGNED_URL_TTL_SECONDS;

// The folders of the documents bucket each kind may be signed from (CLAUDE.md §6.6): booking papers under
// bookings/<id>/, certificates under certificates/<booking_id>/, exports under exports/<profile_id>/. Payout
// files are never handed out by URL.
const DOCUMENT_FOLDERS_BY_KIND: Record<SignedDocumentKind, readonly string[]> = {
  ticket: ['bookings'],
  certificate: ['certificates'],
  invoice: ['bookings'],
  quotation: ['bookings'],
  receipt: ['bookings'],
  credit_note: ['bookings'],
  export: ['exports'],
  whatsapp_document_header: ['bookings', 'certificates'],
};
// A segment starts with a letter or digit, so neither "." nor ".." can climb out of its folder.
const PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MIN_DOCUMENT_SEGMENTS = 3;

export function isDocumentPathFor(kind: SignedDocumentKind, path: string): boolean {
  const segments = path.split('/');
  const [folder] = segments;
  return (
    segments.length >= MIN_DOCUMENT_SEGMENTS &&
    folder !== undefined &&
    DOCUMENT_FOLDERS_BY_KIND[kind].includes(folder) &&
    segments.every((segment) => PATH_SEGMENT.test(segment))
  );
}

// The one place a signed URL into the documents bucket is minted. The caller has already authorised the
// reader for this document; the URL is handed straight back in a redirect and never stored, logged or
// written into a message (CLAUDE.md §6.6). A path outside the kind's own folder is refused, so a bug in a
// caller cannot turn a ticket link into a link to someone's export. `downloadName` makes the link save the file under
// that name instead of opening it (an export).
export async function createDocumentSignedUrl(
  adminClient: DatabaseClient,
  path: string,
  kind: SignedDocumentKind,
  downloadName?: string,
): Promise<string> {
  if (!isDocumentPathFor(kind, path)) throw new AppError('NOT_FOUND');
  const bucket = adminClient.storage.from(DOCUMENTS_BUCKET);
  const ttl = SIGNED_URL_TTL_SECONDS[kind];
  const { data, error } =
    downloadName === undefined
      ? await bucket.createSignedUrl(path, ttl)
      : await bucket.createSignedUrl(path, ttl, { download: downloadName });
  if (error) throw error;
  return data.signedUrl;
}

// The service role is needed below because the limiter and the counter are internal functions no API role may
// run (P1.3.24): a public counter would be a public write. The limiter is keyed by the visitor IP alone (hashed
// by src/lib/rate-limit.ts), and the counter acts only on the id of a booklet the anon policy has just returned
// as published.

// Task P2.4.08: true while the visitor is within the booklet:download limit. It is checked before the booklet is
// even looked up, so guessing ids costs the same as downloading.
export function withinBookletDownloadLimit(
  clientIp: string,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<boolean> {
  return withinRateLimits(adminClient, [
    { name: 'booklet:download', subject: rateLimitIpBucket(clientIp) },
  ]);
}

// increment_booklet_download checks the status again, so an id that is not published never moves a counter
// (docs/PRD.md FR-PUB-07, APP-04).
export function countBookletDownload(
  bookletId: string,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<void> {
  return svcIncrementBookletDownload(adminClient, bookletId);
}

// A booking's quotation, invoice or receipt (Task P3.6.04). The service role is needed because a visitor has no
// session: the row is read by the id the route was given, and the route hands it to requireDocumentReader before
// anything is rendered. The per-IP limit is counted first, so guessing ids costs the same as reading.
export function withinDocumentLimits(
  clientIp: string,
  bookingId: string | null,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<boolean> {
  const checks = [{ name: 'document:ip', subject: rateLimitIpBucket(clientIp) } as const];
  return withinRateLimits(
    adminClient,
    bookingId === null ? checks : [...checks, { name: 'document:booking', subject: bookingId }],
  );
}

export function readBookingDocument(
  kind: BookingDocumentKind,
  id: string,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<BookingDocument | null> {
  return loadBookingDocument(adminClient, kind, id);
}

// The PDF of a document the reader was already authorised for, with the kelurahan's address of site_settings and
// the site's own address for the verify URL.
export async function bookingDocumentFile(
  document: BookingDocument,
  readerId: string | null,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<Buffer> {
  const settings = await getPublicSiteSettings();
  return bookingDocumentPdf(adminClient, document, {
    kelurahanAddress: settings.kelurahanAddress,
    siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL,
    readerId,
  });
}

// A booking's e-ticket PDF (Task P3.11.05), by the booking id the route was given; the route authorises the reader
// against the booking's code before anything is rendered.
export function readTicketDocument(
  bookingId: string,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<TicketDocument | null> {
  return loadTicketDocument(adminClient, bookingId);
}

export async function ticketDocumentFile(
  document: TicketDocument,
  readerId: string | null,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<Buffer> {
  const settings = await getPublicSiteSettings();
  return ticketDocumentPdf(adminClient, document, {
    kelurahanAddress: settings.kelurahanAddress,
    readerId,
  });
}

export interface WhatsAppDocument {
  url: string;
  filename: string;
}

// The document header of gsk_ticket_issued_v1 (Task P3.11.03): a signed URL of 60 minutes to the kept ticket file,
// minted as the message is sent and handed to Meta only, never stored (CLAUDE.md §6.6); null when the booking has no
// ticket file that may be kept.
export async function ticketWhatsAppDocument(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<WhatsAppDocument | null> {
  const settings = await getPublicSiteSettings();
  const path = await keptTicketPdfPath(adminClient, bookingId, settings.kelurahanAddress);
  if (path === null) return null;
  const url = await createDocumentSignedUrl(adminClient, path, 'whatsapp_document_header');
  return { url, filename: path.slice(path.lastIndexOf('/') + 1) };
}

export type VerifyCodeAnswer =
  { kind: 'rate_limited' } | { kind: 'looked_up'; document: VerifiedDocument | null };

// /verifikasi/[code] (Task P3.6.05): the service role reads by the random code alone, after the visitor's IP has been
// counted, so guessing codes costs the same as checking one; the code names no booking and no person by itself.
export async function verifyDocumentCode(
  code: string,
  clientIp: string,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<VerifyCodeAnswer> {
  const isWithinLimit = await withinRateLimits(adminClient, [
    { name: 'verify:code', subject: rateLimitIpBucket(clientIp) },
  ]);
  if (!isWithinLimit) return { kind: 'rate_limited' };
  return { kind: 'looked_up', document: await lookupVerifyCode(adminClient, code) };
}

// The api/jobs/purge-storage run (docs/Security.md §7.3). SQL cannot delete storage objects, so the
// retention runs mark rows and this deletes their files through the Storage API, then lets the rows
// forget the paths. A file whose deletion failed stays marked and is retried on the next run, and
// deleting a file that is already gone is a no-op, so running twice is harmless.
export async function purgeMarkedFiles(
  adminClient: DatabaseClient,
  now = new Date(),
): Promise<PurgeReport> {
  const marked = await removeMarkedFiles(adminClient);
  const quarantine = await removeStaleQuarantineUploads(adminClient, now);
  return {
    processed: marked.processed + quarantine.processed,
    failed: marked.failed + quarantine.failed,
  };
}

async function removeMarkedFiles(adminClient: DatabaseClient): Promise<PurgeReport> {
  const files = await svcPurgeableFiles(adminClient, PURGE_BATCH_SIZE);
  const removedPaths: string[] = [];
  let failed = 0;

  for (const [bucket, paths] of groupPathsByBucket(files)) {
    const { error } = await adminClient.storage.from(bucket).remove(paths);
    if (error) {
      failed += paths.length;
      continue;
    }
    removedPaths.push(...paths);
  }

  if (removedPaths.length > 0) await svcForgetPurgedFiles(adminClient, removedPaths);
  return { processed: removedPaths.length, failed };
}

function groupPathsByBucket(files: PurgeableFile[]): Map<string, string[]> {
  const pathsByBucket = new Map<string, string[]>();
  for (const file of files) {
    pathsByBucket.set(file.bucket, [...(pathsByBucket.get(file.bucket) ?? []), file.path]);
  }
  return pathsByBucket;
}

// The owner folders at the root of the quarantine bucket, one per RW that has uploaded and the kelurahan's. A folder
// entry has no id; anything else at the root is not where api/uploads/sign writes, so it is left alone.
async function quarantineOwnerFolders(
  quarantine: ReturnType<DatabaseClient['storage']['from']>,
): Promise<string[]> {
  const { data, error } = await quarantine.list('', { limit: PURGE_BATCH_SIZE });
  if (error) throw error;
  return data
    .filter((entry) => entry.id === null && isMediaOwner(entry.name))
    .map((entry) => entry.name);
}

// Raw uploads that were never finalised are dropped after a day.
async function removeStaleQuarantineUploads(
  adminClient: DatabaseClient,
  now: Date,
): Promise<PurgeReport> {
  const quarantine = adminClient.storage.from(QUARANTINE_BUCKET);
  const cutoff = now.getTime() - QUARANTINE_MAX_AGE_HOURS * MS_PER_HOUR;
  const report: PurgeReport = { processed: 0, failed: 0 };

  // api/uploads/sign puts every upload under an owner prefix (CLAUDE.md §6.6): the folders at the bucket's root.
  for (const prefix of await quarantineOwnerFolders(quarantine)) {
    const { data: objects, error: listError } = await quarantine.list(prefix, {
      limit: PURGE_BATCH_SIZE,
      sortBy: { column: 'created_at', order: 'asc' },
    });
    if (listError) throw listError;

    // A folder entry carries no created_at, so it never counts as stale.
    const stalePaths = objects
      .filter((object) => object.created_at !== null && Date.parse(object.created_at) < cutoff)
      .map((object) => `${prefix}/${object.name}`);
    if (stalePaths.length === 0) continue;

    const { error } = await quarantine.remove(stalePaths);
    if (error) report.failed += stalePaths.length;
    else report.processed += stalePaths.length;
  }
  return report;
}
