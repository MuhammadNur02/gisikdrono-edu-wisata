import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { RwId } from '@/config/rw';
import { MAX_BOOKLET_PAGES, PUBLIC_MEDIA_BUCKET } from '@/config/uploads';
import type { Database } from '@/db/types';
import {
  bookletPagesFolder,
  bookletPdfPath,
  isPublishedImagePathFor,
  thumbnailPathFor,
} from '@/lib/uploads/paths';

// What the CMS reads back from public-media, or removes from it, for upload-service.ts, the module that holds the
// service role (no API role has a Storage policy, docs/Security.md §6.8). Every path here was checked to be a file
// finalize published under the owner's own prefix.

type DatabaseClient = SupabaseClient<Database>;

const PAGE_FILE = /^\d{4}\.webp$/;
const PDF_FILE_NAME = 'booklet.pdf';

interface CountResult {
  count: number | null;
  error: { message: string } | null;
}

function countOf(result: CountResult): number {
  if (result.error) throw new Error(`media reference count failed: ${result.error.message}`);
  return result.count ?? 0;
}

// Gallery photos are also what RW pages, activity points and schedules show (the CMS and pnpm db:seed --media point
// them at gallery files), so a file goes only when no row shows it any more.
async function referenceCount(adminClient: DatabaseClient, path: string): Promise<number> {
  const head = { count: 'exact' as const, head: true };
  const counts = await Promise.all([
    adminClient.from('galleries').select('id', head).eq('storage_path', path),
    adminClient.from('galleries').select('id', head).eq('thumbnail_path', path),
    adminClient.from('rw_units').select('id', head).eq('hero_image_path', path),
    adminClient.from('activity_points').select('id', head).eq('image_path', path),
    adminClient.from('performance_schedules').select('id', head).eq('image_path', path),
  ]);
  return counts.reduce((total, result) => total + countOf(result), 0);
}

// A removed gallery item's photo and its thumbnail (docs/PRD.md FR-ADMIN-10), once the row is gone.
export async function removeUnusedGalleryFiles(
  adminClient: DatabaseClient,
  rwId: RwId | null,
  paths: (string | null)[],
): Promise<string[]> {
  const ownPhotos = paths.filter(
    (path): path is string =>
      path !== null && isPublishedImagePathFor(path, { rwId, purpose: 'gallery' }),
  );
  const unused: string[] = [];
  for (const path of new Set(ownPhotos)) {
    if ((await referenceCount(adminClient, path)) === 0) unused.push(path);
  }
  if (unused.length === 0) return [];
  const { error } = await adminClient.storage.from(PUBLIC_MEDIA_BUCKET).remove(unused);
  if (error) throw error;
  return unused;
}

export interface PublishedBooklet {
  pageCount: number;
  fileSizeBytes: number;
}

// What finalize really published for a booklet: its PDF's size and the page images in its pages folder. The form
// reports both from its own upload, but the row keeps what Storage holds (Task P2.9.06).
export async function readPublishedBooklet(
  adminClient: DatabaseClient,
  rwId: RwId | null,
  bookletId: string,
): Promise<PublishedBooklet | null> {
  const bucket = adminClient.storage.from(PUBLIC_MEDIA_BUCKET);
  const pdfPath = bookletPdfPath(rwId, bookletId);
  const folder = pdfPath.slice(0, pdfPath.lastIndexOf('/'));
  const [files, pages] = await Promise.all([
    bucket.list(folder, { search: PDF_FILE_NAME }),
    bucket.list(bookletPagesFolder(rwId, bookletId), { limit: MAX_BOOKLET_PAGES + 1 }),
  ]);
  if (files.error) throw files.error;
  if (pages.error) throw pages.error;
  const pdf = files.data.find((file) => file.name === PDF_FILE_NAME);
  const size: unknown = pdf?.metadata?.size;
  if (typeof size !== 'number') return null;
  return {
    pageCount: pages.data.filter((page) => PAGE_FILE.test(page.name)).length,
    fileSizeBytes: size,
  };
}

// A gallery photo's 480 px copy is named after the photo itself (src/lib/uploads/paths.ts).
export function isThumbnailOf(thumbnailPath: string | null, imagePath: string): boolean {
  return thumbnailPath === null || thumbnailPath === thumbnailPathFor(imagePath);
}
