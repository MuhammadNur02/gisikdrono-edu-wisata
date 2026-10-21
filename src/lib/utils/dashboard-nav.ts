import { DASHBOARD_NAV_GROUPS, type DashboardNavGroup, type DashboardNavItem } from '@/config/nav';
import type { AppRole } from '@/db/enums';
import { isPathUnder } from '@/lib/utils/paths';

type StaffRole = Exclude<AppRole, 'none'>;

// What the sidebar needs to know about the staff member's own RW; NULL for the superadmin, who has none.
export interface StaffRwFeatures {
  scheduleEnabled: boolean;
}

function isVisibleTo(
  item: DashboardNavItem,
  role: StaffRole,
  ownRw: StaffRwFeatures | null,
): boolean {
  if (!item.roles.includes(role)) return false;
  if (role === 'superadmin' || item.forScheduleRws !== true) return true;
  return ownRw?.scheduleEnabled === true;
}

// The sidebar of one staff member, filtered on the server (docs/StyleGuide.md §6.2). A group with nothing left in it
// is not shown at all.
export function dashboardNavFor(
  role: StaffRole,
  ownRw: StaffRwFeatures | null,
): DashboardNavGroup[] {
  return DASHBOARD_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isVisibleTo(item, role, ownRw)),
  })).filter((group) => group.items.length > 0);
}

// The nav items that sit below this one (Pengaturan above Hero Banner, Rekap above Bagi Hasil): on their pages the
// deeper item is the current one, not this one.
export function nestedHrefs(href: string, allHrefs: readonly string[]): string[] {
  return allHrefs.filter((other) => other !== href && isPathUnder(other, href));
}
