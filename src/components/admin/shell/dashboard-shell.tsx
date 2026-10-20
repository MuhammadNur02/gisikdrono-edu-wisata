import type { ReactNode } from 'react';

import { AppSidebar } from '@/components/admin/shell/app-sidebar';
import { MobileSidebar } from '@/components/admin/shell/mobile-sidebar';
import { Topbar } from '@/components/admin/shell/topbar';
import { copy } from '@/lib/copy/id';

const MAIN_CONTENT_ID = 'konten';

export interface DashboardShellProps {
  nav: ReactNode;
  footer: ReactNode;
  context: ReactNode;
  // The superadmin's RwSwitcher, or null for an RW officer, who never sees one (docs/StyleGuide.md §6.1).
  rwSwitcher: ReactNode;
  children: ReactNode;
}

// The frame around every dashboard page: sidebar from md up, a sheet below it, the topbar and the page frame
// (docs/StyleGuide.md §6.1). Below md the topbar shows the RW chip, unless the RwSwitcher already says the scope.
export function DashboardShell({
  nav,
  footer,
  context,
  rwSwitcher,
  children,
}: DashboardShellProps) {
  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only rounded-xl bg-background px-4 py-3 text-body-sm font-medium shadow-modal focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        {copy.layout.skipToContent}
      </a>
      <AppSidebar context={context} nav={nav} footer={footer} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          menu={<MobileSidebar footer={footer}>{nav}</MobileSidebar>}
          context={rwSwitcher ? null : context}
          actions={rwSwitcher}
        />
        <main
          id={MAIN_CONTENT_ID}
          className="mx-auto w-full max-w-(--breakpoint-2xl) flex-1 space-y-6 p-4 md:p-6 lg:p-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
