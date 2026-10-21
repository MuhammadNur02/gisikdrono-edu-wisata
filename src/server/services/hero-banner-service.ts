import 'server-only';

import type { Tables } from '@/db/types';
import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPublishedImagePathFor } from '@/lib/uploads/paths';
import { toJakartaIsoString } from '@/lib/utils/dates';
import type { HeroBannerValues, UpdateHeroBannerValues } from '@/lib/validations/hero-banner';
import type { StaffContext } from '@/server/auth/guards';
import { rowOrNotFound } from '@/server/services/content-errors';
import { removeFilesOrLog } from '@/server/services/content-files';
import { removeUnusedHeroPhotos } from '@/server/services/upload-service';
import type { BannerProductOption, CleanedUp, HeroBannerAdmin } from '@/types/cms';

// Hero banners through the session client, so the hero_banners policies (the superadmin's alone, created_by =
// auth.uid() on insert) and the AAL2 policy decide (0005).

const COLUMNS =
  'id, title, subtitle, cta_label, cta_href, image_path, mobile_image_path, product_id, sort_order, is_active, starts_at, ends_at';

type BannerRow = Pick<
  Tables<'hero_banners'>,
  | 'id'
  | 'title'
  | 'subtitle'
  | 'cta_label'
  | 'cta_href'
  | 'image_path'
  | 'mobile_image_path'
  | 'product_id'
  | 'sort_order'
  | 'is_active'
  | 'starts_at'
  | 'ends_at'
>;

function toHeroBannerAdmin(row: BannerRow): HeroBannerAdmin {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    imagePath: row.image_path,
    mobileImagePath: row.mobile_image_path,
    productId: row.product_id,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    startsAt: row.starts_at === null ? null : toJakartaIsoString(row.starts_at),
    endsAt: row.ends_at === null ? null : toJakartaIsoString(row.ends_at),
  };
}

// A banner's photos are kelurahan hero uploads (an RW's upload can never be one, src/lib/uploads/paths.ts), or the
// ones it shows already.
function checkedImage(path: string | null, current: string | null): string | null {
  if (path === null || path === current) return path;
  if (!isPublishedImagePathFor(path, { rwId: null, purpose: 'hero' })) {
    throw new AppError('VALIDATION', copy.cms.validation.image);
  }
  return path;
}

function columnsOf(values: HeroBannerValues, current: BannerRow | null) {
  const imagePath = checkedImage(values.imagePath, current?.image_path ?? null);
  if (imagePath === null) throw new AppError('VALIDATION', copy.cms.validation.imageRequired);
  return {
    title: values.title,
    subtitle: values.subtitle,
    cta_label: values.ctaLabel,
    cta_href: values.ctaHref,
    image_path: imagePath,
    mobile_image_path: checkedImage(values.mobileImagePath, current?.mobile_image_path ?? null),
    product_id: values.productId,
    sort_order: values.sortOrder,
    is_active: values.isActive,
    starts_at: values.startsAt,
    ends_at: values.endsAt,
  };
}

export async function listHeroBannersForStaff(): Promise<HeroBannerAdmin[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('hero_banners')
    .select(COLUMNS)
    .order('sort_order')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(toHeroBannerAdmin);
}

// The products a banner may feature: published ones, since the public slide reads its product through the anon
// policy and would lose an unpublished one.
export async function listBannerProducts(): Promise<BannerProductOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('products_umkm')
    .select('id, name')
    .eq('status', 'published')
    .order('name');
  if (error) throw error;
  return data.map((row) => ({ id: row.id, name: row.name }));
}

async function readBanner(id: string): Promise<BannerRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('hero_banners')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createHeroBanner(
  createdBy: string,
  values: HeroBannerValues,
): Promise<HeroBannerAdmin> {
  // Every column is named by columnsOf; the creator is the signed-in superadmin.
  const row = { created_by: createdBy, ...columnsOf(values, null) };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('hero_banners').insert(row).select(COLUMNS).single();
  if (error) throw error;
  return toHeroBannerAdmin(data);
}

// The photos the banner showed before and shows no more (docs/Security.md R34).
function replacedPhotos(before: BannerRow, after: BannerRow): string[] {
  const kept = [after.image_path, after.mobile_image_path];
  return [before.image_path, before.mobile_image_path].filter(
    (path): path is string => path !== null && !kept.includes(path),
  );
}

export async function updateHeroBanner(
  ctx: StaffContext,
  values: UpdateHeroBannerValues,
): Promise<CleanedUp<HeroBannerAdmin>> {
  const current = rowOrNotFound(await readBanner(values.id));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('hero_banners')
    .update(columnsOf(values, current))
    .eq('id', values.id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  const saved = rowOrNotFound(data);
  const replaced = replacedPhotos(current, saved);
  const filesRemoved =
    replaced.length === 0 ||
    (await removeFilesOrLog('hero_banner_files', values.id, () =>
      removeUnusedHeroPhotos(ctx, replaced),
    ));
  return { value: toHeroBannerAdmin(saved), filesRemoved };
}

// The banner takes both its photos along, once no other banner shows them.
export async function removeHeroBanner(ctx: StaffContext, id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('hero_banners')
    .delete()
    .eq('id', id)
    .select('image_path, mobile_image_path')
    .maybeSingle();
  if (error) throw error;
  const removed = rowOrNotFound(data);
  return removeFilesOrLog('hero_banner_files', id, () =>
    removeUnusedHeroPhotos(ctx, [removed.image_path, removed.mobile_image_path]),
  );
}
