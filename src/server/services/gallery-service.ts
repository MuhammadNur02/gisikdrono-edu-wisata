import 'server-only';

import type { Tables } from '@/db/types';
import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPublishedImagePathFor } from '@/lib/uploads/paths';
import type { PublishedImage } from '@/lib/validations/content';
import type { CreateGalleryItemValues, UpdateGalleryItemValues } from '@/lib/validations/gallery';
import { toContentOwner } from '@/server/auth/content-owner';
import type { StaffContext } from '@/server/auth/guards';
import { rowOrNotFound } from '@/server/services/content-errors';
import { removeFilesOrLog } from '@/server/services/content-files';
import { isThumbnailOf } from '@/server/services/media-library';
import { removeGalleryFiles } from '@/server/services/upload-service';
import type { GalleryItemAdmin } from '@/types/cms';
import type { ContentOwner } from '@/types/content';

// Gallery items through the session client, so the galleries policies (uploaded_by = auth.uid() on insert) and the
// AAL2 policy decide (0005). Every write names the owner as well as the id. Removing an item removes its files
// through upload-service.ts, the module that holds the service role.

const COLUMNS =
  'id, rw_id, category, media_type, storage_path, thumbnail_path, video_url, caption, alt_text, taken_at, sort_order, status';
// A provisional list (Task P2.9.06): the DataTable of P4.3.03 brings paging.
const LIST_LIMIT = 120;

type GalleryRow = Pick<
  Tables<'galleries'>,
  | 'id'
  | 'rw_id'
  | 'category'
  | 'media_type'
  | 'storage_path'
  | 'thumbnail_path'
  | 'video_url'
  | 'caption'
  | 'alt_text'
  | 'taken_at'
  | 'sort_order'
  | 'status'
>;

function ownerOfRow(rwId: number | null): ContentOwner {
  const owner = toContentOwner(rwId);
  if (owner === undefined) throw new Error('gallery item of an unknown RW');
  return owner;
}

function toGalleryItemAdmin(row: GalleryRow): GalleryItemAdmin {
  const isVideo = row.media_type === 'video';
  return {
    id: row.id,
    owner: ownerOfRow(row.rw_id),
    category: row.category,
    mediaType: row.media_type,
    previewPath: isVideo ? row.thumbnail_path : (row.thumbnail_path ?? row.storage_path),
    videoUrl: row.video_url,
    caption: row.caption,
    altText: row.alt_text,
    takenAt: row.taken_at,
    sortOrder: row.sort_order,
    status: row.status,
  };
}

function checkPhoto(owner: ContentOwner, image: PublishedImage): void {
  const isOwn = isPublishedImagePathFor(image.path, { rwId: owner, purpose: 'gallery' });
  if (!isOwn || !isThumbnailOf(image.thumbnailPath, image.path)) {
    throw new AppError('VALIDATION', copy.cms.validation.image);
  }
}

// galleries.storage_path is NOT NULL. A photo keeps its file there; a video keeps its own still there, or its
// address when it has none, and the public gallery reads a video's still from thumbnail_path only.
interface MediaColumns {
  storage_path: string;
  thumbnail_path: string | null;
  video_url: string | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
}

function mediaColumnsOf(owner: ContentOwner, values: CreateGalleryItemValues): MediaColumns {
  const photo = values.mediaType === 'image' ? values.image : values.still;
  if (photo) checkPhoto(owner, photo);
  if (values.mediaType === 'image') {
    if (!photo) throw new AppError('VALIDATION', copy.cms.validation.imageRequired);
    return {
      storage_path: photo.path,
      thumbnail_path: photo.thumbnailPath,
      video_url: null,
      ...sizeOf(photo),
    };
  }
  if (values.videoUrl === null) throw new AppError('VALIDATION', copy.cms.validation.youtube);
  const still = photo ? (photo.thumbnailPath ?? photo.path) : null;
  return {
    storage_path: photo?.path ?? values.videoUrl,
    thumbnail_path: still,
    video_url: values.videoUrl,
    ...sizeOf(photo),
  };
}

function sizeOf(photo: PublishedImage | null) {
  return {
    width: photo?.width ?? null,
    height: photo?.height ?? null,
    blurhash: photo?.blurhash ?? null,
  };
}

function describedBy(values: UpdateGalleryItemValues | CreateGalleryItemValues) {
  return {
    category: values.category,
    caption: values.caption,
    alt_text: values.altText,
    taken_at: values.takenAt,
    sort_order: values.sortOrder,
    status: values.status,
  };
}

// The superadmin under `Semua` sees every item RLS shows them; everyone else one owner's.
export async function listGalleryForStaff(
  owner: ContentOwner | 'all',
): Promise<GalleryItemAdmin[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('galleries').select(COLUMNS);
  if (owner === null) query = query.is('rw_id', null);
  else if (owner !== 'all') query = query.eq('rw_id', owner);
  const { data, error } = await query
    .order('sort_order')
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  return data.map(toGalleryItemAdmin);
}

async function readGalleryRow(id: string): Promise<GalleryRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('galleries')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function readGalleryOwner(id: string): Promise<ContentOwner | undefined> {
  const row = await readGalleryRow(id);
  return row ? ownerOfRow(row.rw_id) : undefined;
}

export async function createGalleryItem(
  ctx: StaffContext,
  owner: ContentOwner,
  values: CreateGalleryItemValues,
): Promise<GalleryItemAdmin> {
  // Every column is named here; the owner is the action's and the uploader the signed-in staff member.
  const row = {
    rw_id: owner,
    media_type: values.mediaType,
    uploaded_by: ctx.userId,
    ...mediaColumnsOf(owner, values),
    ...describedBy(values),
  };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('galleries').insert(row).select(COLUMNS).single();
  if (error) throw error;
  return toGalleryItemAdmin(data);
}

export async function updateGalleryItem(
  owner: ContentOwner,
  values: UpdateGalleryItemValues,
): Promise<GalleryItemAdmin> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('galleries').update(describedBy(values)).eq('id', values.id);
  query = owner === null ? query.is('rw_id', null) : query.eq('rw_id', owner);
  const { data, error } = await query.select(COLUMNS).maybeSingle();
  if (error) throw error;
  return toGalleryItemAdmin(rowOrNotFound(data));
}

// docs/PRD.md FR-ADMIN-10: the item takes its photo and thumbnail along (content-files.ts says in which order).
export async function removeGalleryItem(
  ctx: StaffContext,
  owner: ContentOwner,
  id: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('galleries').delete().eq('id', id);
  query = owner === null ? query.is('rw_id', null) : query.eq('rw_id', owner);
  const { data, error } = await query.select('storage_path, thumbnail_path').maybeSingle();
  if (error) throw error;
  const removed = rowOrNotFound(data);
  return removeFilesOrLog('gallery_files', id, () =>
    removeGalleryFiles(ctx, owner, [removed.storage_path, removed.thumbnail_path]),
  );
}
