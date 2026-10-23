import { NavMenuButton } from '@/components/admin/shell/nav-menu-button';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
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

// The groups dashboardNavFor() left for this staff member (docs/StyleGuide.md §6.2), drawn on the server; only the
// current-page state is a client leaf (NavMenuButton). The sidebar and the phone sheet render the same list.
export function DashboardNav({ groups }: { groups: readonly DashboardNavGroup[] }) {
  const allHrefs = groups.flatMap((group) => group.items.map((item) => item.href));
  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.title}>
          <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <NavItem key={item.href} item={item} allHrefs={allHrefs} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
