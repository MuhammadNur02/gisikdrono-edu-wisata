import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { BOOKLET_PDF_TYPE } from '@/config/uploads';
import type { Database } from '@/db/types';
import { AppError } from '@/lib/errors';
import { reencodeImage, thumbnailOf } from '@/lib/images/re-encode';
import { thumbnailPathFor } from '@/lib/uploads/paths';
import { scanBookletPdf } from '@/lib/uploads/pdf-scan';
import { withScanSlot } from '@/lib/uploads/scan-slots';
import type { UploadOutcome } from '@/server/services/upload-service';
import { publicObjectExists, writePublicMedia } from '@/server/services/upload-storage';
import type { FinalizedUpload } from '@/types/upload';

// What api/uploads/finalize writes into public-media once a file has passed its checks (docs/Security.md §8.4). The
// service-role client is handed in by upload-service.ts, the only module allowed to create it.

type DatabaseClient = SupabaseClient<Database>;

const WEBP_TYPE = 'image/webp';

function rethrowUnlessConflict(error: unknown): void {
  if (!(error instanceof AppError && error.code === 'CONFLICT')) throw error;
}

// The main image is written last, as the commit point: a failure between the two writes leaves no image published,
// and the retry finds the thumbnail already there and goes on. A main image already there was written by an earlier
// try of this same upload, since every image takes its quarantine object's own name, so once its thumbnail is there
// too, its data is the answer (security review of PR #14, F6).
export async function publishImage(
  adminClient: DatabaseClient,
  bytes: Buffer,
  path: string,
  withThumbnail: boolean,
): Promise<UploadOutcome<FinalizedUpload>> {
  const image = await reencodeImage(bytes).catch(() => null);
  if (!image) return { ok: false, problem: 'unreadable' };

  const thumbnailPath = withThumbnail ? thumbnailPathFor(path) : null;
  if (thumbnailPath) {
    const thumbnail = await thumbnailOf(image.webp);
    await writePublicMedia(adminClient, thumbnailPath, thumbnail, WEBP_TYPE).catch(
      rethrowUnlessConflict,
    );
  }
  await writePublicMedia(adminClient, path, image.webp, WEBP_TYPE).catch(async (error: unknown) => {
    rethrowUnlessConflict(error);
    if (thumbnailPath && !(await publicObjectExists(adminClient, thumbnailPath))) throw error;
  });
  const { width, height, blurhash } = image;
  return { ok: true, data: { kind: 'image', path, width, height, blurhash, thumbnailPath } };
}

// A process runs a few booklet scans at once (./../../lib/uploads/scan-slots.ts); past that the request is turned
// away before anything is read, and the quarantine object stays for a retry (security review of PR #14, F2).
export async function publishPdf(
  adminClient: DatabaseClient,
  bytes: Buffer,
  path: string,
): Promise<UploadOutcome<FinalizedUpload>> {
  const slot = await withScanSlot(() => scanBookletPdf(bytes));
  if (!slot.ok) throw new AppError('RATE_LIMITED');
  const scan = slot.value;
  if (!scan.ok) return { ok: false, problem: scan.problem, detail: scan.detail ?? null };

  await writePublicMedia(adminClient, path, scan.pdf, BOOKLET_PDF_TYPE);
  const data: FinalizedUpload = {
    kind: 'pdf',
    path,
    pageCount: scan.pageCount,
    fileSizeBytes: scan.pdf.byteLength,
  };
  return { ok: true, data, sanitized: scan.removed };
}
