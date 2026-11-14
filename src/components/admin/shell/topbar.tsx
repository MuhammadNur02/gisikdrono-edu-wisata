import { Search } from 'lucide-react';
import type { ReactNode } from 'react';

import { ScannerModalButton } from '@/components/admin/scanner/scanner-modal-button';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/admin/shell/breadcrumbs';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { BOOKINGS_DASHBOARD_PATH } from '@/config/bookings';
import { copy } from '@/lib/copy/id';

const text = copy.dashboard.topbar;

export interface TopbarProps {
  // The flattened menu of this staff member, for the breadcrumb labels.
  breadcrumbItems: readonly BreadcrumbItem[];
  // The superadmin's RwSwitcher; nothing for an RW officer.
  rwSwitcher: ReactNode;
  // The superadmin may override a wrong day or a closed session window from the ScannerModal too (FR-SCAN-09).
  canOverrideScans: boolean;
  // The gate and the bookings are the edu-wisata staff's: no scan button and no booking search for the Kopdes admin
  // (docs/PRD.md §13.1 A30).
  canScan: boolean;
}

// The bookings list's own `?q=` search, as a plain GET form: it works before any script has loaded.
function BookingSearch() {
  return (
    <form
      action={BOOKINGS_DASHBOARD_PATH}
      method="get"
      role="search"
      className="hidden h-9 w-80 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring lg:flex"
    >
      <Search aria-hidden className="size-3.5 shrink-0" />
      <input
        type="search"
        name="q"
        aria-label={text.search}
        placeholder={text.searchPlaceholder}
        className="min-w-0 flex-1 bg-transparent text-caption text-foreground outline-none placeholder:text-muted-foreground"
      />
    </form>
  );
}

// docs/StyleGuide.md §6.1 (Dasbor Gelap, 2026-11-15): 60 px on the page background. Left: the menu button below md and
// the breadcrumb; right: the booking search, the RwSwitcher and `Scan tiket`, which opens the ScannerModal of §6.6.
// Below md the QuickScannerBar carries the scan button instead.
export function Topbar({ breadcrumbItems, rwSwitcher, canOverrideScans, canScan }: TopbarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-15 items-center gap-3 border-b border-border bg-background px-3 md:gap-4 md:px-6">
      <SidebarTrigger aria-label={copy.dashboard.openMenu} className="-ml-1 md:hidden" />
      <div className="min-w-0 flex-1">
        <Breadcrumbs items={breadcrumbItems} />
      </div>
      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        {canScan ? <BookingSearch /> : null}
        <div className="hidden md:block">{rwSwitcher}</div>
        {canScan ? (
          <ScannerModalButton
            label={text.scanTicket}
            canOverride={canOverrideScans}
            size="sm"
            className="hidden md:inline-flex"
          />
        ) : null}
      </div>
    </header>
  );
}
