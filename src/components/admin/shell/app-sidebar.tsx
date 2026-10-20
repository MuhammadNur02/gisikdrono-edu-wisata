import Link from 'next/link';
import type { ReactNode } from 'react';

import { SiteWordmark } from '@/components/layout/site-wordmark';
import { DASHBOARD_PATH } from '@/config/auth';
import { copy } from '@/lib/copy/id';

export interface AppSidebarProps {
  // The RW context chip (`RW 05` / `Kelurahan`).
  context: ReactNode;
  nav: ReactNode;
  // The user card and `Keluar`.
  footer: ReactNode;
}

// docs/StyleGuide.md §6.1, the basic form of Task P2.8.03: a fixed 264 px column from md up. The collapsible 72 px
// rail, its cookie and Ctrl+B come with the full shadcn Sidebar of Task P4.1.01. Nothing in it animates (§7.3).
export function AppSidebar({ context, nav, footer }: AppSidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-66 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-16 items-center justify-between gap-3 border-b border-sidebar-border px-5">
        <Link href={DASHBOARD_PATH} aria-label={copy.dashboard.homeLink} className="rounded-lg">
          <SiteWordmark />
        </Link>
        {context}
      </div>
      <nav aria-label={copy.dashboard.navLabel} className="flex-1 overflow-y-auto px-3 py-4">
        {nav}
      </nav>
      <div className="space-y-2 border-t border-sidebar-border p-3">{footer}</div>
    </aside>
  );
}
