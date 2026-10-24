import 'server-only';

import { GALLERY_DEFAULT_SORT, GALLERY_SORT_COLUMNS } from '@/config/cms';
import type { RwId } from '@/config/rw';
import { DB_ENUMS } from '@/db/enums';
import type { Tables } from '@/db/types';
import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPublishedImagePathFor } from '@/lib/uploads/paths';
import { allowedValue, planContentList } from '@/lib/utils/content-list';
import type { ListQuery } from '@/lib/utils/list-query';
import type { PublishedImage } from '@/lib/validations/content';
import type { CreateGalleryItemValues, UpdateGalleryItemValues } from '@/lib/validations/gallery';
import type { StaffContext } from '@/server/auth/guards';
import { archivedRowOr, rowOrNotFound } from '@/server/services/content-errors';
import { removeFilesOrLog } from '@/server/services/content-files';
import { isThumbnailOf } from '@/server/services/media-library';
import { removeGalleryFiles } from '@/server/services/upload-service';
import type { GalleryItemAdmin } from '@/types/cms';
import type { ContentOwner } from '@/types/content';
import type { ListResult } from '@/types/data-table';

// Gallery items through the session client, so the galleries policies (uploaded_by = auth.uid() on insert) and the
// AAL2 policy decide (0005). Every write names the owner as well as the id. Removing an item removes its files
// through upload-service.ts, the module that holds the service role.

const COLUMNS =
  'id, rw_id, category, media_type, storage_path, thumbnail_path, video_url, caption, alt_text, taken_at, sort_order, status';

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

function toGalleryItemAdmin(row: GalleryRow): GalleryItemAdmin {
  const isVideo = row.media_type === 'video';
  return {
    id: row.id,
    owner: row.rw_id,
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

// One page of gallery items from the URL's query (Task P4.3.03): an RW admin's own RW, the superadmin's chosen one or
// every item RLS shows them (effectiveRw), searched by the screen-reader text, as the public gallery orders them.
export async function listGalleryForStaff(
  query: ListQuery,
  rw: RwId | null,
): Promise<ListResult<GalleryItemAdmin>> {
  const plan = planContentList(query, rw, {
    columns: GALLERY_SORT_COLUMNS,
    fallback: GALLERY_DEFAULT_SORT,
  });
  const supabase = await createSupabaseServerClient();
  let request = supabase.from('galleries').select(COLUMNS, { count: 'exact' });
  if (plan.pattern !== null) request = request.ilike('alt_text', plan.pattern);
  if (plan.statuses.length > 0) request = request.in('status', plan.statuses);
  const category = allowedValue(query.category, DB_ENUMS.gallery_category);
  if (category !== null) request = request.eq('category', category);
  if (plan.rw !== null) request = request.eq('rw_id', plan.rw);
  if (plan.order !== null) {
    request = request.order(plan.order.column, { ascending: plan.order.ascending });
  }
  const { data, error, count } = await request
    .order('created_at', { ascending: false })
    .order('id')
    .range(plan.from, plan.to);
  if (error) throw error;
  return { rows: data.map(toGalleryItemAdmin), total: count ?? data.length };
}

// Archive by status (Task P4.3.03): off the galleries, kept here with its files.
export async function archiveGalleryItem(owner: ContentOwner, id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('galleries').update({ status: 'archived' }).eq('id', id);
  query = owner === null ? query.is('rw_id', null) : query.eq('rw_id', owner);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  rowOrNotFound(data);
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
  return row ? row.rw_id : undefined;
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
  let query = supabase.from('galleries').delete().eq('id', id).eq('status', 'archived');
  query = owner === null ? query.is('rw_id', null) : query.eq('rw_id', owner);
  const { data, error } = await query.select('id, storage_path, thumbnail_path').maybeSingle();
  if (error) throw error;
  const removed = archivedRowOr(data);
  return removeFilesOrLog('gallery_files', id, () =>
    removeGalleryFiles(ctx, owner, [removed.storage_path, removed.thumbnail_path]),
  );
}
