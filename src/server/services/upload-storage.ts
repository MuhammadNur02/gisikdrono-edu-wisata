import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { RwId } from '@/config/rw';
import {
  PUBLIC_MEDIA_BUCKET,
  PUBLIC_MEDIA_CACHE_SECONDS,
  QUARANTINE_BUCKET,
  QUARANTINE_TOMBSTONE_TYPE,
  SIGNED_UPLOAD_TOKEN_SECONDS,
} from '@/config/uploads';
import type { Database } from '@/db/types';
import { AppError } from '@/lib/errors';
import { bookletPagesFolder, bookletPagesLockPath } from '@/lib/uploads/paths';

// Storage bookkeeping for the upload pipeline (docs/Security.md §8.4). The service-role client is handed in by
// upload-service.ts, the only module allowed to create it. Supabase signs an upload URL for two hours and lets it
// fill an empty path again once its object is gone, but never overwrite one that exists; both the single use of a
// token and the lock on a booklet's pages rest on that.

type DatabaseClient = SupabaseClient<Database>;

export type QuarantineObject = { createdAtMs: number; size: number | null };

const NOT_FOUND = '404';
const ALREADY_EXISTS = '409';
const MS_PER_SECOND = 1000;
const EMPTY = Buffer.alloc(0);

export function storageStatusOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'statusCode' in error
    ? String(error.statusCode)
    : undefined;
}

// The object's bytes, or null when nothing is there.
export async function downloadObject(
  adminClient: DatabaseClient,
  bucket: typeof QUARANTINE_BUCKET | typeof PUBLIC_MEDIA_BUCKET,
  path: string,
): Promise<Buffer | null> {
  const { data, error } = await adminClient.storage.from(bucket).download(path);
  if (storageStatusOf(error) === NOT_FOUND) return null;
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

// Published files are never replaced: a name already taken is a conflict, not an overwrite.
export async function writePublicMedia(
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

// When Storage recorded the upload and how large it is, or null when nothing is there.
export async function quarantineObject(
  adminClient: DatabaseClient,
  path: string,
): Promise<QuarantineObject | null> {
  const { data, error } = await adminClient.storage.from(QUARANTINE_BUCKET).info(path);
  if (storageStatusOf(error) === NOT_FOUND) return null;
  if (error) throw error;
  return { createdAtMs: Date.parse(data.createdAt), size: data.size ?? null };
}

// The file's bytes go and an empty object takes its place, so the two-hour token cannot fill the path again
// (security review of PR #14, L6). The hourly purge removes it after a day.
export async function retireQuarantineObject(adminClient: DatabaseClient, path: string) {
  const { error } = await adminClient.storage
    .from(QUARANTINE_BUCKET)
    .upload(path, EMPTY, { upsert: true, contentType: QUARANTINE_TOMBSTONE_TYPE });
  if (error) throw error;
}

// storage-js answers false for a missing object (HTTP 400 or 404, with an error it does not throw) and throws on
// anything else, so the answer is all there is to read.
export async function publicObjectExists(adminClient: DatabaseClient, path: string) {
  const { data } = await adminClient.storage.from(PUBLIC_MEDIA_BUCKET).exists(path);
  return data;
}

export async function hasPublishedPages(
  adminClient: DatabaseClient,
  rwId: RwId | null,
  bookletId: string,
): Promise<boolean> {
  const { data, error } = await adminClient.storage
    .from(PUBLIC_MEDIA_BUCKET)
    .list(bookletPagesFolder(rwId, bookletId), { limit: 1 });
  if (error) throw error;
  return data.length > 0;
}

async function placeLock(adminClient: DatabaseClient, path: string): Promise<boolean> {
  const { error } = await adminClient.storage
    .from(QUARANTINE_BUCKET)
    .upload(path, EMPTY, { upsert: false, contentType: QUARANTINE_TOMBSTONE_TYPE });
  if (storageStatusOf(error) === ALREADY_EXISTS) return false;
  if (error) throw error;
  return true;
}

// One sign-pages per booklet at a time (security review of PR #14, L11). Placing the lock fails when another
// request holds it; a lock older than the two-hour token lifetime belongs to an attempt whose URLs have all
// expired, so it is replaced. Removing and placing again gives the new lock its own creation time.
export async function claimBookletPagesLock(
  adminClient: DatabaseClient,
  rwId: RwId | null,
  bookletId: string,
  nowMs: number,
): Promise<boolean> {
  const path = bookletPagesLockPath(rwId, bookletId);
  if (await placeLock(adminClient, path)) return true;
  const lock = await quarantineObject(adminClient, path);
  const isStale =
    lock !== null && nowMs - lock.createdAtMs > SIGNED_UPLOAD_TOKEN_SECONDS * MS_PER_SECOND;
  if (!isStale) return false;
  await adminClient.storage.from(QUARANTINE_BUCKET).remove([path]);
  return placeLock(adminClient, path);
}
