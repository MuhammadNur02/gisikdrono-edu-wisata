import {
  BOOKING_ENABLED_KEY,
  EDITABLE_SETTING_KEYS,
  type EditableSettingName,
} from '@/config/site-settings';
import { siteSettingsSchema, type SiteSettingsValues } from '@/lib/validations/settings';

// Between the rows of site_settings and the settings forms (Task P4.9.01). Pure, so reading and saving agree on which
// key is which field. A form names its fields: the superadmin's every editable key (the default), the Kopdes admin's
// the catalogue keys alone (CATALOGUE_SETTING_NAMES, docs/PRD.md §13.1 A30).

// The superadmin's form's field names, in the schema's order.
const NAMES: readonly EditableSettingName[] = siteSettingsSchema.keyof().options;

export interface SettingRow {
  key: string;
  value: unknown;
}

export interface SettingWrite {
  key: (typeof EDITABLE_SETTING_KEYS)[EditableSettingName];
  value: SiteSettingsValues[EditableSettingName];
}

// The form's fields from the rows, by field name, for the form's schema to type; keys the form does not edit stay out.
export function formFieldsOf(
  rows: readonly SettingRow[],
  names: readonly EditableSettingName[] = NAMES,
): Record<string, unknown> {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return Object.fromEntries(names.map((name) => [name, byKey.get(EDITABLE_SETTING_KEYS[name])]));
}

// booking_enabled as stored, shown beside the form but never part of it.
export function bookingEnabledOf(rows: readonly SettingRow[]): boolean {
  return rows.some((row) => row.key === BOOKING_ENABLED_KEY && row.value === true);
}

// The writes a save of these fields needs: only the keys whose value changed, so the audit log records what someone
// actually changed.
export function changedSettingsAmong<Name extends EditableSettingName>(
  names: readonly Name[],
  current: Pick<SiteSettingsValues, Name>,
  next: Pick<SiteSettingsValues, Name>,
): SettingWrite[] {
  return names
    .filter((name) => current[name] !== next[name])
    .map((name) => ({ key: EDITABLE_SETTING_KEYS[name], value: next[name] }));
}

export function changedSettings(
  current: SiteSettingsValues,
  next: SiteSettingsValues,
): SettingWrite[] {
  return changedSettingsAmong(NAMES, current, next);
}

// The fields still holding a seeded placeholder, by the test internal.placeholder_site_settings() applies.
export function placeholderFieldsAmong<Name extends EditableSettingName>(
  names: readonly Name[],
  values: Pick<SiteSettingsValues, Name>,
  isPlaceholder: (value: string) => boolean,
): Name[] {
  return names.filter((name) => {
    const value = values[name];
    return typeof value === 'string' && isPlaceholder(value);
  });
}

export function placeholderFields(
  values: SiteSettingsValues,
  isPlaceholder: (value: string) => boolean,
): EditableSettingName[] {
  return placeholderFieldsAmong(NAMES, values, isPlaceholder);
}
