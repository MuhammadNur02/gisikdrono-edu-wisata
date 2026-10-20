import type { SaveActivityPointInput } from '@/lib/validations/activity-point';
import type { ActivityPointAdmin } from '@/types/cms';

// A new point, under a fresh id that names its photo's folder (20261021080000_content_row_ids.sql).
export function blankActivityPoint(): SaveActivityPointInput {
  return {
    id: crypto.randomUUID(),
    name: '',
    slug: '',
    pointType: 'other',
    shortDescription: '',
    bodyMd: '',
    imagePath: null,
    mapX: null,
    mapY: null,
    lat: null,
    lng: null,
    sortOrder: 0,
    status: 'published',
  };
}

// Exactly the form's fields: the RW stays out, since the schema refuses anything it does not list.
export function activityPointValues(point: ActivityPointAdmin): SaveActivityPointInput {
  return {
    id: point.id,
    name: point.name,
    slug: point.slug,
    pointType: point.pointType,
    shortDescription: point.shortDescription ?? '',
    bodyMd: point.bodyMd ?? '',
    imagePath: point.imagePath,
    mapX: point.mapX,
    mapY: point.mapY,
    lat: point.lat,
    lng: point.lng,
    sortOrder: point.sortOrder,
    status: point.status === 'published' ? 'published' : 'draft',
  };
}
