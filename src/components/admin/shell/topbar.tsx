import { ScanLine } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Breadcrumbs, type BreadcrumbItem } from '@/components/admin/shell/breadcrumbs';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { SCANNER_PATH } from '@/config/dashboard';
import { copy } from '@/lib/copy/id';

export interface TopbarProps {
  // The flattened menu of this staff member, for the breadcrumb labels.
  breadcrumbItems: readonly BreadcrumbItem[];
  // The superadmin's RwSwitcher; nothing for an RW officer.
  rwSwitcher: ReactNode;
  // Shown below md only, where the sidebar's context chip is out of sight and no RwSwitcher says the scope.
  context: ReactNode;
  commandMenu: ReactNode;
  userMenu: ReactNode;
}

// docs/StyleGuide.md §6.1 (Task P4.1.01): sidebar trigger and breadcrumb on the left; the RwSwitcher, `Scan Tiket`,
// the command palette and the avatar menu on the right. `Scan Tiket` opens the scanner page; the ScannerModal of
// §6.6 takes its place in Task P4.4. Below md the QuickScannerBar carries the scan button instead.
export function Topbar({
  breadcrumbItems,
  rwSwitcher,
  context,
  commandMenu,
  userMenu,
}: TopbarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur md:gap-3 md:px-6">
      <SidebarTrigger aria-label={copy.dashboard.openMenu} className="-ml-1" />
      <div className="hidden min-w-0 flex-1 sm:block">
        <Breadcrumbs items={breadcrumbItems} />
      </div>
      <div className="min-w-0 flex-1 sm:hidden">{rwSwitcher ? null : context}</div>
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        <div className="hidden md:block">{rwSwitcher}</div>
        <Button asChild size="sm" className="hidden md:inline-flex">
          <Link href={SCANNER_PATH}>
            <ScanLine aria-hidden />
            {copy.dashboard.topbar.scanTicket}
          </Link>
        </Button>
        {commandMenu}
        {userMenu}
      </div>
    </header>
  );
}
