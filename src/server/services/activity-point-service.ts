import 'server-only';

import type { RwId } from '@/config/rw';
import type { Tables } from '@/db/types';
import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPublishedImagePathFor } from '@/lib/uploads/paths';
import type { SaveActivityPointValues } from '@/lib/validations/activity-point';
import { toContentOwner } from '@/server/auth/content-owner';
import type { StaffContext } from '@/server/auth/guards';
import { rowOrNotFound, slugConflictOr } from '@/server/services/content-errors';
import { removeFilesOrLog } from '@/server/services/content-files';
import { removeRowPhotos } from '@/server/services/upload-service';
import type { ActivityPointAdmin } from '@/types/cms';

// Activity points through the session client, so activity_points_staff and the AAL2 policy decide (0005). Every
// write names the RW as well as the id, so a row of another RW is not touched even if a policy were wider.

const COLUMNS =
  'id, rw_id, name, slug, point_type, short_description, body_md, image_path, map_x, map_y, lat, lng, sort_order, status';

type PointRow = Pick<
  Tables<'activity_points'>,
  | 'id'
  | 'rw_id'
  | 'name'
  | 'slug'
  | 'point_type'
  | 'short_description'
  | 'body_md'
  | 'image_path'
  | 'map_x'
  | 'map_y'
  | 'lat'
  | 'lng'
  | 'sort_order'
  | 'status'
>;

function toActivityPointAdmin(row: PointRow): ActivityPointAdmin {
  const rwId = toContentOwner(row.rw_id);
  if (rwId === null || rwId === undefined) throw new Error('activity point without a known RW');
  return {
    id: row.id,
    rwId,
    name: row.name,
    slug: row.slug,
    pointType: row.point_type,
    shortDescription: row.short_description,
    bodyMd: row.body_md,
    imagePath: row.image_path,
    mapX: row.map_x,
    mapY: row.map_y,
    lat: row.lat,
    lng: row.lng,
    sortOrder: row.sort_order,
    status: row.status,
  };
}

function columnsOf(values: SaveActivityPointValues) {
  return {
    name: values.name,
    slug: values.slug,
    point_type: values.pointType,
    short_description: values.shortDescription,
    body_md: values.bodyMd,
    image_path: values.imagePath,
    map_x: values.mapX,
    map_y: values.mapY,
    lat: values.lat,
    lng: values.lng,
    sort_order: values.sortOrder,
    status: values.status,
  };
}

// The photo lies in this point's own folder of its RW, or is the one the point shows already.
function checkImage(rwId: RwId, values: SaveActivityPointValues, current: string | null): void {
  const path = values.imagePath;
  if (path === null || path === current) return;
  const target = { rwId, purpose: 'activity-point' as const, entityId: values.id };
  if (!isPublishedImagePathFor(path, target))
    throw new AppError('VALIDATION', copy.cms.validation.image);
}

export async function listActivityPointsForStaff(rwIds: RwId[]): Promise<ActivityPointAdmin[]> {
  if (rwIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('activity_points')
    .select(COLUMNS)
    .in('rw_id', rwIds)
    .order('rw_id')
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data.map(toActivityPointAdmin);
}

async function readPoint(id: string): Promise<ActivityPointAdmin | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('activity_points')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toActivityPointAdmin(data) : null;
}

// The RW the database holds for a point this staff member can see, for the guard; undefined when RLS hides it.
export async function readActivityPointOwner(id: string): Promise<RwId | undefined> {
  return (await readPoint(id))?.rwId;
}

export async function createActivityPoint(
  rwId: RwId,
  values: SaveActivityPointValues,
): Promise<ActivityPointAdmin> {
  checkImage(rwId, values, null);
  // Every column is named by columnsOf; the id is the form's, the RW the action's.
  const row = { id: values.id, rw_id: rwId, ...columnsOf(values) };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('activity_points')
    .insert(row)
    .select(COLUMNS)
    .single();
  if (error) throw slugConflictOr(error);
  return toActivityPointAdmin(data);
}

export async function updateActivityPoint(
  rwId: RwId,
  values: SaveActivityPointValues,
): Promise<ActivityPointAdmin> {
  const current = rowOrNotFound(await readPoint(values.id));
  checkImage(rwId, values, current.imagePath);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('activity_points')
    .update(columnsOf(values))
    .eq('id', values.id)
    .eq('rw_id', rwId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw slugConflictOr(error);
  return toActivityPointAdmin(rowOrNotFound(data));
}

// The point takes the photos of its own folder along (content-files.ts says in which order).
export async function removeActivityPoint(
  ctx: StaffContext,
  rwId: RwId,
  id: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('activity_points')
    .delete()
    .eq('id', id)
    .eq('rw_id', rwId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  rowOrNotFound(data);
  await removeFilesOrLog('activity_point_files', id, () =>
    removeRowPhotos(ctx, { rwId, purpose: 'activity-point', entityId: id }),
  );
}
