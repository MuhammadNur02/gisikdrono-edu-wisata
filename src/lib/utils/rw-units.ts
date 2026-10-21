import { rwLabel, type RwId } from '@/config/rw';
import type { Tables } from '@/db/types';
import { rwPagePath } from '@/lib/utils/paths';
import type { RwBadge, RwUnitSummary } from '@/types/rw-unit';

// An rw_units row as menus, switchers and links show it, for the public reads and the dashboard alike.
export const RW_UNIT_SUMMARY_COLUMNS =
  'id, slug, name, short_name, accent_key, icon_key, schedule_enabled';

export type RwUnitSummaryRow = Pick<
  Tables<'rw_units'>,
  'id' | 'slug' | 'name' | 'short_name' | 'accent_key' | 'icon_key' | 'schedule_enabled'
>;

export function toRwUnitSummary(row: RwUnitSummaryRow): RwUnitSummary {
  return {
    id: row.id,
    label: rwLabel(row.id),
    name: row.name,
    shortName: row.short_name,
    slug: row.slug,
    path: rwPagePath(row.slug),
    accentKey: row.accent_key,
    iconKey: row.icon_key,
    scheduleEnabled: row.schedule_enabled,
  };
}

// The RW a row belongs to, as a page marks it. An RW missing from `units` is offline, so it keeps its number and
// the neutral colours.
export function rwBadgeFor(rwId: RwId, units: readonly RwBadge[]): RwBadge {
  const unit = units.find((candidate) => candidate.id === rwId);
  return { id: rwId, label: rwLabel(rwId), accentKey: unit?.accentKey ?? null };
}
