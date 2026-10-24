import 'server-only';

import { POINT_DEFAULT_SORT, POINT_SORT_COLUMNS } from '@/config/cms';
import type { RwId } from '@/config/rw';
import { DB_ENUMS } from '@/db/enums';
import type { Tables } from '@/db/types';
import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPublishedImagePathFor } from '@/lib/uploads/paths';
import { allowedValue, planContentList } from '@/lib/utils/content-list';
import type { ListQuery } from '@/lib/utils/list-query';
import type { SaveActivityPointValues } from '@/lib/validations/activity-point';
import type { StaffContext } from '@/server/auth/guards';
import { archivedRowOr, rowOrNotFound, slugConflictOr } from '@/server/services/content-errors';
import { removeFilesOrLog } from '@/server/services/content-files';
import { keepRowPhotos, removeRowPhotos } from '@/server/services/upload-service';
import type { ActivityPointAdmin, CleanedUp } from '@/types/cms';
import type { ListResult } from '@/types/data-table';

// Activity points through the session client, so activity_points_staff and the AAL2 policy decide (0005). Every
// write names the RW as well as the id, so a row of another RW is not touched even if a policy were wider.

const COLUMNS =
  'id, rw_id, name, slug, point_type, short_description, body_md, image_path, map_x, map_y, svg_hotspot_id, lat, lng, sort_order, status';

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
  | 'svg_hotspot_id'
  | 'lat'
  | 'lng'
  | 'sort_order'
  | 'status'
>;

function toActivityPointAdmin(row: PointRow): ActivityPointAdmin {
  return {
    id: row.id,
    rwId: row.rw_id,
    name: row.name,
    slug: row.slug,
    pointType: row.point_type,
    shortDescription: row.short_description,
    bodyMd: row.body_md,
    imagePath: row.image_path,
    mapX: row.map_x,
    mapY: row.map_y,
    svgHotspotId: row.svg_hotspot_id,
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
    svg_hotspot_id: values.svgHotspotId,
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

// One page of activity points from the URL's query (Task P4.3.03): an RW admin's own RW, the superadmin's chosen one or
// every RW's (effectiveRw), searched by name, `?category=` naming the point type.
export async function listActivityPointsForStaff(
  query: ListQuery,
  rw: RwId | null,
): Promise<ListResult<ActivityPointAdmin>> {
  const plan = planContentList(query, rw, {
    columns: POINT_SORT_COLUMNS,
    fallback: POINT_DEFAULT_SORT,
  });
  const supabase = await createSupabaseServerClient();
  let request = supabase.from('activity_points').select(COLUMNS, { count: 'exact' });
  if (plan.pattern !== null) request = request.ilike('name', plan.pattern);
  if (plan.statuses.length > 0) request = request.in('status', plan.statuses);
  const pointType = allowedValue(query.category, DB_ENUMS.activity_point_type);
  if (pointType !== null) request = request.eq('point_type', pointType);
  if (plan.rw !== null) request = request.eq('rw_id', plan.rw);
  if (plan.order !== null) {
    request = request.order(plan.order.column, { ascending: plan.order.ascending });
  }
  const { data, error, count } = await request
    .order('rw_id')
    .order('name')
    .order('id')
    .range(plan.from, plan.to);
  if (error) throw error;
  return { rows: data.map(toActivityPointAdmin), total: count ?? data.length };
}

// Archive by status (Task P4.3.03): off the RW's map, kept here with its photo.
export async function archiveActivityPoint(rwId: RwId, id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('activity_points')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('rw_id', rwId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  rowOrNotFound(data);
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

// The point's folder keeps only the photo it shows (docs/Security.md R34): an upload it replaced, or one the form
// left unsaved, goes in the same action.
async function keepOnlyPointPhoto(
  ctx: StaffContext,
  rwId: RwId,
  point: ActivityPointAdmin,
): Promise<CleanedUp<ActivityPointAdmin>> {
  const target = { rwId, purpose: 'activity-point' as const, entityId: point.id };
  const keep = point.imagePath === null ? [] : [point.imagePath];
  const filesRemoved = await removeFilesOrLog('activity_point_files', point.id, () =>
    keepRowPhotos(ctx, target, keep),
  );
  return { value: point, filesRemoved };
}

export async function createActivityPoint(
  ctx: StaffContext,
  rwId: RwId,
  values: SaveActivityPointValues,
): Promise<CleanedUp<ActivityPointAdmin>> {
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
  return keepOnlyPointPhoto(ctx, rwId, toActivityPointAdmin(data));
}

export async function updateActivityPoint(
  ctx: StaffContext,
  rwId: RwId,
  values: SaveActivityPointValues,
): Promise<CleanedUp<ActivityPointAdmin>> {
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
  return keepOnlyPointPhoto(ctx, rwId, toActivityPointAdmin(rowOrNotFound(data)));
}

// The point takes the photos of its own folder along (content-files.ts says in which order).
export async function removeActivityPoint(
  ctx: StaffContext,
  rwId: RwId,
  id: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('activity_points')
    .delete()
    .eq('id', id)
    .eq('rw_id', rwId)
    .eq('status', 'archived')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  archivedRowOr(data);
  return removeFilesOrLog('activity_point_files', id, () =>
    removeRowPhotos(ctx, { rwId, purpose: 'activity-point', entityId: id }),
  );
}
