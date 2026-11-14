import { NavGroupSection } from '@/components/admin/shell/nav-group-section';
import { NavMenuButton } from '@/components/admin/shell/nav-menu-button';
import { SidebarGroup, SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import { DASHBOARD_PATH } from '@/config/auth';
import type { DashboardNavGroup, DashboardNavItem } from '@/config/nav';
import { nestedHrefs } from '@/lib/utils/dashboard-nav';

function NavItem({ item, allHrefs }: { item: DashboardNavItem; allHrefs: readonly string[] }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <NavMenuButton
        href={item.href}
        label={item.label}
        exact={item.href === DASHBOARD_PATH}
        nested={nestedHrefs(item.href, allHrefs)}
      >
        <Icon aria-hidden />
        <span>{item.label}</span>
      </NavMenuButton>
    </SidebarMenuItem>
  );
}

function GroupMenu({ group, allHrefs }: { group: DashboardNavGroup; allHrefs: readonly string[] }) {
  return (
    <SidebarMenu className="gap-0.5">
      {group.items.map((item) => (
        <NavItem key={item.href} item={item} allHrefs={allHrefs} />
      ))}
    </SidebarMenu>
  );
}

// The groups dashboardNavFor() left for this staff member (docs/StyleGuide.md §6.2), drawn on the server; only which
// group is open and which item is current are client state (NavGroupSection, NavMenuButton). The overview stands alone;
// every other group folds under its heading. The sidebar and the phone sheet render the same list.
export function DashboardNav({ groups }: { groups: readonly DashboardNavGroup[] }) {
  const allHrefs = groups.flatMap((group) => group.items.map((item) => item.href));
  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.title} className="py-0">
          {group.isPlain ? (
            <GroupMenu group={group} allHrefs={allHrefs} />
          ) : (
            <NavGroupSection
              title={group.title}
              hrefs={group.items.map((item) => item.href)}
              startsOpen={group.startsOpen ?? false}
            >
              <GroupMenu group={group} allHrefs={allHrefs} />
            </NavGroupSection>
          )}
        </SidebarGroup>
      ))}
    </>
  );
}
