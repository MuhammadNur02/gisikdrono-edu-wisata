import 'server-only';

import { RW_IDS } from '@/config/rw';
import type { Tables } from '@/db/types';
import { toPublicImage, toRwId } from '@/lib/queries/mappers';
import { cachedPublicRead, rowsOf } from '@/lib/queries/public-read';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import type { ActivityPoint } from '@/types/activity-point';

const ACTIVITY_POINT_COLUMNS =
  'id, rw_id, slug, name, point_type, short_description, body_md, image_path, map_x, map_y, svg_hotspot_id, lat, lng';

type ActivityPointRow = Pick<
  Tables<'activity_points'>,
  | 'id'
  | 'rw_id'
  | 'slug'
  | 'name'
  | 'point_type'
  | 'short_description'
  | 'body_md'
  | 'image_path'
  | 'map_x'
  | 'map_y'
  | 'svg_hotspot_id'
  | 'lat'
  | 'lng'
>;

function toActivityPoint(row: ActivityPointRow): ActivityPoint {
  return {
    id: row.id,
    rwId: toRwId(row.rw_id),
    slug: row.slug,
    name: row.name,
    pointType: row.point_type,
    shortDescription: row.short_description,
    bodyMd: row.body_md,
    image: toPublicImage(row.image_path, row.name),
    mapX: row.map_x,
    mapY: row.map_y,
    svgHotspotId: row.svg_hotspot_id,
    lat: row.lat,
    lng: row.lng,
  };
}

// Published points of both RWs: the site plan and the map show them together.
export const listActivityPoints = cachedPublicRead(
  async (): Promise<ActivityPoint[]> => {
    const result = await createSupabaseAnonClient()
      .from('activity_points')
      .select(ACTIVITY_POINT_COLUMNS)
      .order('rw_id')
      .order('sort_order');
    return rowsOf(result, 'activity_points').map(toActivityPoint);
  },
  ['activity-points', 'list'],
  RW_IDS.map((rwId) => TAGS.activityPoints(rwId)),
);
