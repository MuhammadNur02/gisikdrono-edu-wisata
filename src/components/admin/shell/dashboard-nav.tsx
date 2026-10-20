import { NavLink } from '@/components/admin/shell/nav-link';
import { DASHBOARD_PATH } from '@/config/auth';
import type { DashboardNavGroup, DashboardNavItem } from '@/config/nav';
import { nestedHrefs } from '@/lib/utils/dashboard-nav';

function NavItem({ item, allHrefs }: { item: DashboardNavItem; allHrefs: readonly string[] }) {
  const Icon = item.icon;
  return (
    <li>
      <NavLink
        href={item.href}
        exact={item.href === DASHBOARD_PATH}
        nested={nestedHrefs(item.href, allHrefs)}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{item.label}</span>
      </NavLink>
    </li>
  );
}

// The groups dashboardNavFor() left for this staff member, drawn on the server; only the current-page state is a
// client leaf (NavLink). The sidebar and the phone menu render the same list.
export function DashboardNav({ groups }: { groups: readonly DashboardNavGroup[] }) {
  const allHrefs = groups.flatMap((group) => group.items.map((item) => item.href));
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.title} className="space-y-1">
          <p className="px-3 text-overline text-muted-foreground">{group.title}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <NavItem key={item.href} item={item} allHrefs={allHrefs} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
