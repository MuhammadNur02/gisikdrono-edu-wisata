import Link from 'next/link';
import type { ReactNode } from 'react';

import { SiteWordmark } from '@/components/layout/site-wordmark';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';
import { DASHBOARD_PATH } from '@/config/auth';
import { copy } from '@/lib/copy/id';

export interface AppSidebarProps {
  // The RW context chip (`RW 05` / `Kelurahan`).
  context: ReactNode;
  nav: ReactNode;
  // The user card and `Keluar`.
  footer: ReactNode;
}

// docs/StyleGuide.md §6.1 (Task P4.1.01): the shadcn Sidebar, 264 px expanded and a 72 px icon rail collapsed, a sheet
// from the left below md. The rail shows the initial of the wordmark and tooltips on the items; nothing in it
// animates beyond the CSS width transition (§7.3).
export function AppSidebar({ context, nav, footer }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="h-16 flex-row items-center justify-between gap-3 border-b border-sidebar-border px-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <Link
          href={DASHBOARD_PATH}
          aria-label={copy.dashboard.homeLink}
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <SiteWordmark showEyebrow={false} className="group-data-[collapsible=icon]:hidden" />
          <span
            aria-hidden
            className="hidden size-10 items-center justify-center rounded-xl bg-primary text-h4 font-extrabold text-primary-foreground group-data-[collapsible=icon]:flex"
          >
            G
          </span>
        </Link>
        <span className="group-data-[collapsible=icon]:hidden">{context}</span>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label={copy.dashboard.navLabel} className="flex flex-col gap-1 py-2">
          {nav}
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
