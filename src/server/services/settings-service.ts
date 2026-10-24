import 'server-only';

import { isPlaceholderSetting } from '@/lib/queries/settings';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  bookingEnabledOf,
  changedSettings,
  formFieldsOf,
  placeholderFields,
} from '@/lib/utils/site-settings';
import { siteSettingsSchema, type SiteSettingsValues } from '@/lib/validations/settings';
import type { StaffContext } from '@/server/auth/guards';
import { rowOrNotFound } from '@/server/services/content-errors';
import type { SiteSettingsAdmin } from '@/types/settings';

// site_settings for /dashboard/settings (Task P4.9.01) through the session client, so the policies decide again: the
// superadmin alone reads the private keys and writes any, signing each row with their own id, and every write needs a
// TOTP code from the last five minutes (site_settings_fresh_totp_*, 0005). site_settings_required_keys keeps the
// numbers the database's functions read, and the log_audit trigger records each changed row in audit_logs.

async function readRows() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('site_settings').select('key, value');
  if (error) throw error;
  return data;
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

// Writes the keys whose value changed, one row each, and answers how many. A key the policies hide from this account
// updates no row, which reads as NOT_FOUND rather than as a silent success.
export async function updateSiteSettings(
  ctx: StaffContext,
  next: SiteSettingsValues,
): Promise<number> {
  const current = siteSettingsSchema.parse(formFieldsOf(await readRows()));
  const writes = changedSettings(current, next);
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
