import {
  BOOKING_ENABLED_KEY,
  EDITABLE_SETTING_KEYS,
  type EditableSettingName,
} from '@/config/site-settings';
import { siteSettingsSchema, type SiteSettingsValues } from '@/lib/validations/settings';

// Between the rows of site_settings and the settings form (Task P4.9.01). Pure, so reading and saving agree on which
// key is which field.

// The form's field names, in the schema's order.
const NAMES: readonly EditableSettingName[] = siteSettingsSchema.keyof().options;

export interface SettingRow {
  key: string;
  value: unknown;
}

export interface SettingWrite {
  key: (typeof EDITABLE_SETTING_KEYS)[EditableSettingName];
  value: SiteSettingsValues[EditableSettingName];
}

// The form's fields from the rows, by field name, for siteSettingsSchema to type; keys the form does not edit stay out.
export function formFieldsOf(rows: readonly SettingRow[]): Record<string, unknown> {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return Object.fromEntries(NAMES.map((name) => [name, byKey.get(EDITABLE_SETTING_KEYS[name])]));
}

// booking_enabled as stored, shown beside the form but never part of it.
export function bookingEnabledOf(rows: readonly SettingRow[]): boolean {
  return rows.some((row) => row.key === BOOKING_ENABLED_KEY && row.value === true);
}

// The writes a save needs: only the keys whose value changed, so the audit log records what someone actually changed.
export function changedSettings(
  current: SiteSettingsValues,
  next: SiteSettingsValues,
): SettingWrite[] {
  return NAMES.filter((name) => current[name] !== next[name]).map((name) => ({
    key: EDITABLE_SETTING_KEYS[name],
    value: next[name],
  }));
}

// The fields still holding a seeded placeholder, by the test internal.placeholder_site_settings() applies.
export function placeholderFields(
  values: SiteSettingsValues,
  isPlaceholder: (value: string) => boolean,
): EditableSettingName[] {
  return NAMES.filter((name) => {
    const value = values[name];
    return typeof value === 'string' && isPlaceholder(value);
  });
}
