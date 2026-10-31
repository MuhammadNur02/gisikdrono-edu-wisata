import 'server-only';

import { CATALOGUE_SETTING_NAMES } from '@/config/site-settings';
import { isPlaceholderSetting } from '@/lib/queries/settings';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  bookingEnabledOf,
  changedSettings,
  changedSettingsAmong,
  formFieldsOf,
  placeholderFields,
  placeholderFieldsAmong,
  type SettingWrite,
} from '@/lib/utils/site-settings';
import {
  catalogueSettingsSchema,
  siteSettingsSchema,
  type CatalogueSettingsValues,
  type SiteSettingsValues,
} from '@/lib/validations/settings';
import type { StaffContext } from '@/server/auth/guards';
import { rowOrNotFound } from '@/server/services/content-errors';
import type { CatalogueSettingsAdmin, SiteSettingsAdmin } from '@/types/settings';

// site_settings for /dashboard/settings (Task P4.9.01) through the session client, so the policies decide again: the
// superadmin alone reads the private keys and writes any, the Kopdes admin reads and writes the three catalogue keys
// alone (docs/PRD.md §13.1 A30, 20261105180500), each signing its rows with its own id, and every write needs a TOTP
// code from the last five minutes (site_settings_fresh_totp_*, 0005). site_settings_required_keys keeps the numbers the
// database's functions read, and the log_audit trigger records each changed row in audit_logs.

async function readRows() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('site_settings').select('key, value');
  if (error) throw error;
  return data;
}

// Writes each changed key, one row each, and answers how many. A key the policies hide from this account updates no
// row, which reads as NOT_FOUND rather than as a silent success.
async function writeSettings(ctx: StaffContext, writes: readonly SettingWrite[]): Promise<number> {
  const supabase = await createSupabaseServerClient();
  for (const write of writes) {
    const { data, error } = await supabase
      .from('site_settings')
      .update({ value: write.value, updated_by: ctx.userId })
      .eq('key', write.key)
      .select('key')
      .maybeSingle();
    if (error) throw error;
    rowOrNotFound(data);
  }
  return writes.length;
}

export async function readSiteSettingsForStaff(): Promise<SiteSettingsAdmin> {
  const rows = await readRows();
  const values = siteSettingsSchema.parse(formFieldsOf(rows));
  return {
    values,
    bookingEnabled: bookingEnabledOf(rows),
    placeholders: placeholderFields(values, isPlaceholderSetting),
  };
}

export async function updateSiteSettings(
  ctx: StaffContext,
  next: SiteSettingsValues,
): Promise<number> {
  const current = siteSettingsSchema.parse(formFieldsOf(await readRows()));
  return writeSettings(ctx, changedSettings(current, next));
}

// Pengaturan Katalog, the Kopdes admin's page of /dashboard/settings (docs/PRD.md §13.1 A30).
export async function readCatalogueSettingsForStaff(): Promise<CatalogueSettingsAdmin> {
  const values = catalogueSettingsSchema.parse(
    formFieldsOf(await readRows(), CATALOGUE_SETTING_NAMES),
  );
  return {
    values,
    placeholders: placeholderFieldsAmong(CATALOGUE_SETTING_NAMES, values, isPlaceholderSetting),
  };
}

export async function updateCatalogueSettings(
  ctx: StaffContext,
  next: CatalogueSettingsValues,
): Promise<number> {
  const current = catalogueSettingsSchema.parse(
    formFieldsOf(await readRows(), CATALOGUE_SETTING_NAMES),
  );
  return writeSettings(ctx, changedSettingsAmong(CATALOGUE_SETTING_NAMES, current, next));
}
