import type { ReactNode } from 'react';

import { AppSidebar } from '@/components/admin/shell/app-sidebar';
import type { BreadcrumbItem } from '@/components/admin/shell/breadcrumbs';
import { QuickScannerBar } from '@/components/admin/shell/quick-scanner-bar';
import { Topbar } from '@/components/admin/shell/topbar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { copy } from '@/lib/copy/id';
import { DASHBOARD_SHELL_ID } from '@/lib/utils/idle-lock';

const MAIN_CONTENT_ID = 'konten';

function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only rounded-xl bg-background px-4 py-3 text-body-sm font-medium shadow-modal focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
    >
      {copy.layout.skipToContent}
    </a>
  );
}

export interface DashboardShellProps {
  // Whether the sidebar opens expanded, as the sidebar_state cookie last left it.
  sidebarOpen: boolean;
  nav: ReactNode;
  footer: ReactNode;
  context: ReactNode;
  breadcrumbItems: readonly BreadcrumbItem[];
  // The superadmin's RwSwitcher, or null for an RW officer, who never sees one (docs/StyleGuide.md §6.1).
  rwSwitcher: ReactNode;
  commandMenu: ReactNode;
  userMenu: ReactNode;
  // The idle lock overlay, mounted last so it sits above everything.
  idleLock: ReactNode;
  children: ReactNode;
}

// The frame around every dashboard page (docs/StyleGuide.md §6.1): the shadcn Sidebar (a sheet below md), the topbar,
// the page frame and, below md, the QuickScannerBar. The superadmin's RwSwitcher sits in the topbar from md up and on
// its own row below it, where the topbar has no room for it.
export function DashboardShell({
  sidebarOpen,
  nav,
  footer,
  context,
  breadcrumbItems,
  rwSwitcher,
  commandMenu,
  userMenu,
  idleLock,
  children,
}: DashboardShellProps) {
  return (
    <SidebarProvider id={DASHBOARD_SHELL_ID} defaultOpen={sidebarOpen} className="bg-background">
      <SkipLink />
      <AppSidebar context={context} nav={nav} footer={footer} />
      <div className="flex min-h-svh min-w-0 flex-1 flex-col">
        <Topbar
          breadcrumbItems={breadcrumbItems}
          rwSwitcher={rwSwitcher}
          context={context}
          commandMenu={commandMenu}
          userMenu={userMenu}
        />
        {rwSwitcher ? (
          <div className="overflow-x-auto px-4 pt-3 md:hidden">{rwSwitcher}</div>
        ) : null}
        <main
          id={MAIN_CONTENT_ID}
          className="mx-auto w-full max-w-(--breakpoint-2xl) flex-1 space-y-6 p-4 pb-24 md:p-6 lg:p-8"
        >
          {children}
        </main>
        <QuickScannerBar />
      </div>
      {idleLock}
    </SidebarProvider>
  );
}
