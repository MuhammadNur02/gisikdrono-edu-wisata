import { Landmark } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { DASHBOARD_PATH } from '@/config/auth';
import { copy } from '@/lib/copy/id';

const text = copy.dashboard;

export interface AppSidebarProps {
  // What this dashboard covers, under the name: `Dasbor kelurahan` or `Dasbor RW 05`.
  scopeLabel: string;
  // The `Lompat ke menu…` bar (CommandMenu).
  jump: ReactNode;
  nav: ReactNode;
  // The user card with `Keluar`.
  footer: ReactNode;
}

function BrandLink({ scopeLabel }: { scopeLabel: string }) {
  return (
    <Link
      href={DASHBOARD_PATH}
      aria-label={text.homeLink}
      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md outline-none group-data-[collapsible=icon]:flex-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
      >
        <Landmark className="size-4" />
      </span>
      <span className="min-w-0 group-data-[collapsible=icon]:hidden">
        <span className="block truncate text-body-sm font-semibold text-foreground">
          {text.brandName}
        </span>
        <span className="block truncate text-caption text-muted-foreground">{scopeLabel}</span>
      </span>
    </Link>
  );
}

// docs/StyleGuide.md §6.1 (Dasbor Gelap, 2026-11-15): the shadcn Sidebar on the sunken surface, 248 px expanded and a
// 72 px icon rail collapsed, a sheet from the left below md. Brand, the collapse button and the jump bar on top; the
// grouped menu; the user card at the bottom. Nothing in it animates beyond the CSS width transition (§7.3).
export function AppSidebar({ scopeLabel, jump, nav, footer }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="gap-3 px-3 pt-3.5">
        <div className="flex items-center gap-2 px-1.5 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
          <BrandLink scopeLabel={scopeLabel} />
          <SidebarTrigger
            aria-label={text.toggleSidebar}
            className="hidden text-muted-foreground md:inline-flex"
          />
        </div>
        {jump}
      </SidebarHeader>
      <SidebarContent className="px-1">
        <nav aria-label={text.navLabel} className="flex flex-col py-1">
          {nav}
        </nav>
      </SidebarContent>
      <SidebarFooter className="px-3 pb-3">{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
