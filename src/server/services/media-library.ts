import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { RwId } from '@/config/rw';
import { MAX_BOOKLET_PAGES, PUBLIC_MEDIA_BUCKET } from '@/config/uploads';
import type { Database } from '@/db/types';
import {
  bookletPagesFolder,
  bookletPdfPath,
  isPublishedImagePathFor,
  rowPhotoFolder,
  thumbnailPathFor,
} from '@/lib/uploads/paths';

// What the CMS reads back from public-media, or removes from it, for upload-service.ts, the module that holds the
// service role (no API role has a Storage policy, docs/Security.md §6.8). Every path here was checked to be a file
// finalize published under the owner's own prefix.

type DatabaseClient = SupabaseClient<Database>;

const PAGE_FILE = /^\d{4}\.webp$/;
const PDF_FILE_NAME = 'booklet.pdf';
// More photos than one article or point ever holds; a folder past it keeps the rest for a later clean-up.
const ROW_FOLDER_LIST_LIMIT = 1000;

interface CountResult {
  count: number | null;
  error: { message: string } | null;
}

function countOf(result: CountResult): number {
  if (result.error) throw new Error(`media reference count failed: ${result.error.message}`);
  return result.count ?? 0;
}

type ReferenceCount = (adminClient: DatabaseClient, path: string) => Promise<number>;

const HEAD_COUNT = { count: 'exact' as const, head: true };

// Gallery photos are also what RW pages and schedules show (they have no upload folder of their own), so a file goes
// only when no row shows it any more. Activity points and articles keep copies in their own folders
// (20261021090100_content_media_paths.sql), so they never hold a gallery file.
const galleryReferences: ReferenceCount = async (adminClient, path) => {
  const counts = await Promise.all([
    adminClient.from('galleries').select('id', HEAD_COUNT).eq('storage_path', path),
    adminClient.from('galleries').select('id', HEAD_COUNT).eq('thumbnail_path', path),
    adminClient.from('rw_units').select('id', HEAD_COUNT).eq('hero_image_path', path),
    adminClient.from('performance_schedules').select('id', HEAD_COUNT).eq('image_path', path),
  ]);
  return counts.reduce((total, result) => total + countOf(result), 0);
};

// A hero photo is shown by banners only, perhaps by more than one.
const heroReferences: ReferenceCount = async (adminClient, path) => {
  const counts = await Promise.all([
    adminClient.from('hero_banners').select('id', HEAD_COUNT).eq('image_path', path),
    adminClient.from('hero_banners').select('id', HEAD_COUNT).eq('mobile_image_path', path),
  ]);
  return counts.reduce((total, result) => total + countOf(result), 0);
};

function photosOf(
  paths: (string | null)[],
  target: { rwId: RwId | null; purpose: 'gallery' | 'hero' },
) {
  return paths.filter(
    (path): path is string => path !== null && isPublishedImagePathFor(path, target),
  );
}

async function removeUnreferenced(
  adminClient: DatabaseClient,
  paths: string[],
  references: ReferenceCount,
): Promise<string[]> {
  const unused: string[] = [];
  for (const path of new Set(paths)) {
    if ((await references(adminClient, path)) === 0) unused.push(path);
  }
  if (unused.length === 0) return [];
  const { error } = await adminClient.storage.from(PUBLIC_MEDIA_BUCKET).remove(unused);
  if (error) throw error;
  return unused;
}

// A removed gallery item's photo and its thumbnail (docs/PRD.md FR-ADMIN-10), or the photo an RW page or a schedule
// stopped showing (docs/Security.md R34), once no row shows it.
export async function removeUnusedGalleryFiles(
  adminClient: DatabaseClient,
  rwId: RwId | null,
  paths: (string | null)[],
): Promise<string[]> {
  return removeUnreferenced(
    adminClient,
    photosOf(paths, { rwId, purpose: 'gallery' }),
    galleryReferences,
  );
}

// The photos a banner stopped showing or took along when it was removed (docs/Security.md R34).
export async function removeUnusedHeroFiles(
  adminClient: DatabaseClient,
  paths: (string | null)[],
): Promise<string[]> {
  return removeUnreferenced(
    adminClient,
    photosOf(paths, { rwId: null, purpose: 'hero' }),
    heroReferences,
  );
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

// A removed booklet's PDF and page images (Task P2.9.06). Their paths follow from the owner and the id alone, never
// from the row, so nothing outside that booklet's own folder can be named.
export async function removeBookletFolder(
  adminClient: DatabaseClient,
  rwId: RwId | null,
  bookletId: string,
): Promise<number> {
  const bucket = adminClient.storage.from(PUBLIC_MEDIA_BUCKET);
  const folder = bookletPagesFolder(rwId, bookletId);
  const pages = await bucket.list(folder, { limit: MAX_BOOKLET_PAGES + 1 });
  if (pages.error) throw pages.error;
  const pagePaths = pages.data
    .filter((page) => PAGE_FILE.test(page.name))
    .map((page) => `${folder}/${page.name}`);
  const paths = [bookletPdfPath(rwId, bookletId), ...pagePaths];
  const { error } = await bucket.remove(paths);
  if (error) throw error;
  return paths.length;
}

export interface RowPhotos {
  rwId: RwId | null;
  purpose: 'article' | 'activity-point';
  entityId: string;
}

// A row's own photo folder keeps exactly the photos the row shows now (docs/Security.md R34): an article's cover and
// body photos, an activity point's photo; none once the row is removed. The folder follows from the owner, the
// purpose and the id alone, and only the photos finalize named in it go.
export async function keepOnlyRowPhotos(
  adminClient: DatabaseClient,
  target: RowPhotos,
  keep: string[],
): Promise<number> {
  const bucket = adminClient.storage.from(PUBLIC_MEDIA_BUCKET);
  const folder = rowPhotoFolder(target);
  const files = await bucket.list(folder, { limit: ROW_FOLDER_LIST_LIMIT });
  if (files.error) throw files.error;
  const kept = new Set(keep);
  const unused = files.data
    .map((file) => `${folder}/${file.name}`)
    .filter((path) => isPublishedImagePathFor(path, target) && !kept.has(path));
  if (unused.length === 0) return 0;
  const { error } = await bucket.remove(unused);
  if (error) throw error;
  return unused.length;
}
