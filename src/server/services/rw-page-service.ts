import 'server-only';

import type { RwId } from '@/config/rw';
import type { Tables } from '@/db/types';
import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPublishedImagePathFor } from '@/lib/uploads/paths';
import { pageRange, searchPattern, type ListQuery } from '@/lib/utils/list-query';
import { rwPagePath } from '@/lib/utils/paths';
import type { UpdateRwPageValues } from '@/lib/validations/rw-page';
import type { StaffContext } from '@/server/auth/guards';
import { removeFilesOrLog } from '@/server/services/content-files';
import { removeGalleryFiles } from '@/server/services/upload-service';
import type { CleanedUp, RwPageAdmin, RwPageListItem } from '@/types/cms';
import type { ListResult } from '@/types/data-table';

// The RW pages through the session client, so rw_units_staff_update, rw_units_guard and the AAL2 policy decide
// (0004, 0005). Only the content columns are read or written; the treasury account is granted to no API role.

const COLUMNS =
  'id, slug, name, tagline, description_md, vision_md, hero_image_path, contact_phone, contact_email, map_lat, map_lng';

type RwPageRow = Pick<
  Tables<'rw_units'>,
  | 'slug'
  | 'name'
  | 'tagline'
  | 'description_md'
  | 'vision_md'
  | 'hero_image_path'
  | 'contact_phone'
  | 'contact_email'
  | 'map_lat'
  | 'map_lng'
>;

function toRwPageAdmin(rwId: RwId, row: RwPageRow): RwPageAdmin {
  return {
    rwId,
    path: rwPagePath(row.slug),
    name: row.name,
    tagline: row.tagline,
    descriptionMd: row.description_md,
    visionMd: row.vision_md,
    heroImagePath: row.hero_image_path,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    mapLat: row.map_lat,
    mapLng: row.map_lng,
  };
}

async function readRwPageForStaff(rwId: RwId): Promise<RwPageAdmin | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('rw_units')
    .select(COLUMNS)
    .eq('id', rwId)
    .maybeSingle();
  if (error) throw error;
  return data ? toRwPageAdmin(rwId, data) : null;
}

// The RW pages a staff member edits, one page of them from the URL's query (Task P4.3.03): an RW admin's own, the
// superadmin's chosen RW or every RW (effectiveRw), searched by name, in the menu's order. The row id is the RW's.
export async function listRwPagesForStaff(
  query: ListQuery,
  rw: RwId | null,
): Promise<ListResult<RwPageListItem>> {
  const { from, to } = pageRange(query.page, query.per);
  const supabase = await createSupabaseServerClient();
  let request = supabase.from('rw_units').select(COLUMNS, { count: 'exact' });
  const pattern = searchPattern(query.q);
  if (pattern !== null) request = request.ilike('name', pattern);
  if (rw !== null) request = request.eq('id', rw);
  const { data, error, count } = await request.order('sort_order').order('id').range(from, to);
  if (error) throw error;
  const rows = data.map((row) => ({ ...toRwPageAdmin(row.id, row), id: String(row.id) }));
  return { rows, total: count ?? rows.length };
}

// The photo is a gallery photo of this RW (rw_units has no upload folder of its own; pnpm db:seed --media does the
// same), or the one the page shows already.
function checkHeroImage(rwId: RwId, path: string | null, current: string | null): void {
  if (path === null || path === current) return;
  if (!isPublishedImagePathFor(path, { rwId, purpose: 'gallery' })) {
    throw new AppError('VALIDATION', copy.cms.validation.image);
  }
}

export async function updateRwPage(
  ctx: StaffContext,
  rwId: RwId,
  values: UpdateRwPageValues,
): Promise<CleanedUp<RwPageAdmin>> {
  const current = await readRwPageForStaff(rwId);
  if (!current) throw new AppError('NOT_FOUND');
  checkHeroImage(rwId, values.heroImagePath, current.heroImagePath);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('rw_units')
    .update({
      tagline: values.tagline,
      description_md: values.descriptionMd,
      vision_md: values.visionMd,
      hero_image_path: values.heroImagePath,
      contact_phone: values.contactPhone,
      contact_email: values.contactEmail,
      map_lat: values.mapLat,
      map_lng: values.mapLng,
    })
    .eq('id', rwId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  // RLS lets an update of another RW's page touch no row.
  if (!data) throw new AppError('NOT_FOUND');
  return {
    value: toRwPageAdmin(rwId, data),
    filesRemoved: await removeReplacedPhoto(ctx, rwId, current, values),
  };
}

// The photo the page stopped showing leaves public-media, unless a gallery item still shows it (docs/Security.md
// R34; removeGalleryFiles counts every row that does).
async function removeReplacedPhoto(
  ctx: StaffContext,
  rwId: RwId,
  current: RwPageAdmin,
  values: UpdateRwPageValues,
): Promise<boolean> {
  const replaced = current.heroImagePath;
  if (replaced === null || replaced === values.heroImagePath) return true;
  return removeFilesOrLog('rw_page_files', String(rwId), () =>
    removeGalleryFiles(ctx, rwId, [replaced]),
  );
}
