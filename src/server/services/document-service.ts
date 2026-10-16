import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { svcForgetPurgedFiles, svcPurgeableFiles } from '@/db/rpc';
import type { PurgeableFile } from '@/db/rpc';
import type { Database } from '@/db/types';

type DatabaseClient = SupabaseClient<Database>;

export type PurgeReport = { processed: number; failed: number };

const PURGE_BATCH_SIZE = 200;
const QUARANTINE_BUCKET = 'uploads-quarantine';
// Upload paths are bound to these prefixes in api/uploads/sign (CLAUDE.md §6.6).
const QUARANTINE_PREFIXES = ['rw-05', 'rw-08', 'kelurahan'] as const;
const MS_PER_HOUR = 3_600_000;
const QUARANTINE_MAX_AGE_HOURS = 24;

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

// Raw uploads that were never finalised are dropped after a day.
async function removeStaleQuarantineUploads(
  adminClient: DatabaseClient,
  now: Date,
): Promise<PurgeReport> {
  const quarantine = adminClient.storage.from(QUARANTINE_BUCKET);
  const cutoff = now.getTime() - QUARANTINE_MAX_AGE_HOURS * MS_PER_HOUR;
  const report: PurgeReport = { processed: 0, failed: 0 };

  for (const prefix of QUARANTINE_PREFIXES) {
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
