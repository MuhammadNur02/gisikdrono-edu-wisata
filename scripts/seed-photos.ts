import { readdirSync, readFileSync } from 'node:fs';
import { join, parse } from 'node:path';

import { z } from 'zod';

import { runSql, sqlText, uploadToLocalBucket } from './local-stack';
import { reencodeImage } from '../src/lib/images/re-encode';
import { ownerFor } from '../src/lib/uploads/paths';

// The steps both photo sets of pnpm db:seed share: the development photos (scripts/demo-media.ts) and the photos
// of the kelurahan's own site (scripts/official-media.ts). Each photo goes through reencodeImage, the step
// api/uploads/finalize uses, so the local site shows exactly what an upload becomes, and the file goes up before
// the row that points at it.

const PUBLIC_MEDIA_BUCKET = 'public-media';
const WEBP_TYPE = 'image/webp';
const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export interface UploadedPhoto {
  path: string;
  width: number;
  height: number;
  blurhash: string;
}

export interface GalleryRow {
  id: string;
  rwId: number;
  category: 'activity' | 'umkm' | 'visit' | 'event';
  altText: string;
  caption: string;
  sortOrder: number;
}

// Camera files differ in case (IMG_7571.JPG, img_7571.jpg); the folder is matched by name, not spelling.
export function findPhotoFile(folder: string, name: string): string {
  const match = readdirSync(folder).find((entry) => {
    const { name: base, ext } = parse(entry);
    return base.toLowerCase() === name.toLowerCase() && PHOTO_EXTENSIONS.has(ext.toLowerCase());
  });
  if (!match) throw new Error(`${name} is not in ${folder}`);
  return join(folder, match);
}

export async function uploadPhoto(
  folder: string,
  file: string,
  path: string,
): Promise<UploadedPhoto> {
  const image = await reencodeImage(readFileSync(findPhotoFile(folder, file)));
  await uploadToLocalBucket(PUBLIC_MEDIA_BUCKET, path, image.webp, WEBP_TYPE);
  return { path, width: image.width, height: image.height, blurhash: image.blurhash };
}

export function galleryPath(rwId: number, photoId: string): string {
  return `${ownerFor(rwId)}/gallery/${photoId}.webp`;
}

export async function idOfSlug(
  table: 'activity_points' | 'articles',
  slug: string,
): Promise<string | null> {
  const rows = z
    .array(z.object({ id: z.string() }))
    .parse(await runSql(`select id from public.${table} where slug = ${sqlText(slug)}`));
  return rows[0]?.id ?? null;
}

// Running the seed again uploads the same file over itself and keeps the row as it is.
export async function seedGalleryPhoto(
  folder: string,
  file: string,
  row: GalleryRow,
): Promise<void> {
  const uploaded = await uploadPhoto(folder, file, galleryPath(row.rwId, row.id));
  await runSql(`insert into public.galleries (id, rw_id, category, storage_path, width, height, blurhash,
      alt_text, caption, status, sort_order)
    values (${sqlText(row.id)}, ${String(row.rwId)}, ${sqlText(row.category)}, ${sqlText(uploaded.path)},
            ${String(uploaded.width)}, ${String(uploaded.height)}, ${sqlText(uploaded.blurhash)},
            ${sqlText(row.altText)}, ${sqlText(row.caption)}, 'published', ${String(row.sortOrder)})
    on conflict (id) do nothing`);
}

// An RW page shows one of its own gallery photos, which its rule allows. A photo someone already set is kept.
export async function linkRwHero(rwId: number, photoId: string): Promise<void> {
  await runSql(`update public.rw_units set hero_image_path = ${sqlText(galleryPath(rwId, photoId))}
      where id = ${String(rwId)} and hero_image_path is null`);
}

// An activity point keeps a copy of its photo in its own folder, as the CMS and the database require
// (supabase/migrations/20261021090100_content_media_paths.sql). A photo someone already set is kept.
export async function linkPointPhoto(
  folder: string,
  slug: string,
  photo: { id: string; file: string; rwId: number },
): Promise<void> {
  const pointId = await idOfSlug('activity_points', slug);
  if (!pointId) return;
  const path = `${ownerFor(photo.rwId)}/activity-points/${pointId}/${photo.id}.webp`;
  await uploadPhoto(folder, photo.file, path);
  await runSql(`update public.activity_points set image_path = ${sqlText(path)}
    where id = ${sqlText(pointId)} and image_path is null`);
}
