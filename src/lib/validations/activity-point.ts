import { z } from 'zod';

import { CMS_LIMITS, MAP_PERCENT_MAX } from '@/config/cms';
import { PLAN_HOTSPOT_IDS } from '@/config/map';
import { DB_ENUMS } from '@/db/enums';
import {
  contentText,
  imagePathSchema,
  optionalContentText,
  optionalNumber,
  publishableStatusSchema,
  rowIdSchema,
  slugSchema,
  sortOrderSchema,
} from '@/lib/validations/content';

// /dashboard/activity-points (docs/PRD.md FR-ADMIN-14). The id is the form's own for a new point, so its photo can go
// into the point's folder first (20261021080000_content_row_ids.sql); the RW is never part of the form.
// svg_hotspot_id is checked against the element ids of public/map/denah.svg (PLAN_HOTSPOT_IDS).

const LATITUDE_LIMIT = 90;
const LONGITUDE_LIMIT = 180;

export const saveActivityPointSchema = z
  .object({
    id: rowIdSchema,
    name: contentText(CMS_LIMITS.pointName),
    slug: slugSchema,
    pointType: z.enum(DB_ENUMS.activity_point_type),
    shortDescription: optionalContentText(CMS_LIMITS.pointShortDescription),
    bodyMd: optionalContentText(CMS_LIMITS.longText),
    imagePath: imagePathSchema,
    mapX: optionalNumber(0, MAP_PERCENT_MAX),
    mapY: optionalNumber(0, MAP_PERCENT_MAX),
    // The plan element the hotspot highlights (docs/StyleGuide.md §5.13): one of denah.svg's ids, or none.
    svgHotspotId: z.enum(PLAN_HOTSPOT_IDS).nullable(),
    lat: optionalNumber(-LATITUDE_LIMIT, LATITUDE_LIMIT),
    lng: optionalNumber(-LONGITUDE_LIMIT, LONGITUDE_LIMIT),
    sortOrder: sortOrderSchema,
    status: publishableStatusSchema,
  })
  .strict();

export type SaveActivityPointInput = z.input<typeof saveActivityPointSchema>;
export type SaveActivityPointValues = z.output<typeof saveActivityPointSchema>;
