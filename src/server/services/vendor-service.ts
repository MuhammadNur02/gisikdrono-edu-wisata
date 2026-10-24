import 'server-only';

import type { RwId } from '@/config/rw';
import type { Tables } from '@/db/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { UpdateVendorValues, VendorValues } from '@/lib/validations/product';
import type { StaffContext } from '@/server/auth/guards';
import { rowOrNotFound, slugConflictOr } from '@/server/services/content-errors';
import type { VendorAdmin } from '@/types/vendor';

// UMKM vendors through the session client (Task P4.3.06, docs/PRD.md FR-ADMIN-06): umkm_vendors_staff_read shows staff
// their own RW's vendors, and the column grants of 0005 keep the bank columns out of every read and write here. Entry
// is the superadmin's (decision of the user, 2026-10-24); the actions check that before calling in.

const VENDOR_COLUMNS = 'id, rw_id, slug, name, owner_name, phone, description_md, is_active';

type VendorRow = Pick<
  Tables<'umkm_vendors'>,
  'id' | 'rw_id' | 'slug' | 'name' | 'owner_name' | 'phone' | 'description_md' | 'is_active'
>;

function toVendorAdmin(row: VendorRow): VendorAdmin {
  return {
    id: row.id,
    rwId: row.rw_id,
    slug: row.slug,
    name: row.name,
    ownerName: row.owner_name,
    phone: row.phone,
    descriptionMd: row.description_md,
    isActive: row.is_active,
  };
}

function columnsOf(values: VendorValues) {
  return {
    slug: values.slug,
    name: values.name,
    owner_name: values.ownerName,
    phone: values.phone,
    description_md: values.descriptionMd,
    is_active: values.isActive,
  };
}

export async function listVendorsForStaff(rwId: RwId): Promise<VendorAdmin[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('umkm_vendors')
    .select(VENDOR_COLUMNS)
    .eq('rw_id', rwId)
    .order('name');
  if (error) throw error;
  return data.map(toVendorAdmin);
}

export async function readVendorForStaff(id: string): Promise<VendorAdmin | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('umkm_vendors')
    .select(VENDOR_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toVendorAdmin(data) : null;
}

export async function createVendor(
  ctx: StaffContext,
  rwId: RwId,
  values: VendorValues,
): Promise<VendorAdmin> {
  const row = { rw_id: rwId, created_by: ctx.userId, ...columnsOf(values) };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('umkm_vendors')
    .insert(row)
    .select(VENDOR_COLUMNS)
    .single();
  if (error) throw slugConflictOr(error);
  return toVendorAdmin(data);
}

// The RW stays: a vendor's products share it (products_umkm_vendor_rw_guard).
export async function updateVendor(values: UpdateVendorValues): Promise<VendorAdmin> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('umkm_vendors')
    .update(columnsOf(values))
    .eq('id', values.id)
    .select(VENDOR_COLUMNS)
    .maybeSingle();
  if (error) throw slugConflictOr(error);
  return toVendorAdmin(rowOrNotFound(data));
}
