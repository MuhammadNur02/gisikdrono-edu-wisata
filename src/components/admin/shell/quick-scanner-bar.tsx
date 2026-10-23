'use client';

import { ScanLine, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BOOKINGS_PATH, SCANNER_PATH } from '@/config/dashboard';
import { copy } from '@/lib/copy/id';
import { isPathUnder } from '@/lib/utils/paths';

const text = copy.dashboard.quickScanner;
const QUERY_PARAM = 'q';

// docs/StyleGuide.md §6.7 (Task P4.1.01): below md a fixed bottom bar with the scan button and a booking-code field.
// Until the ScannerModal of Task P4.4 exists, `Scan` opens the scanner page and the code searches the bookings list.
// Hidden on the scanner page itself; the page frame leaves room for it at the bottom.
export function QuickScannerBar() {
  const pathname = usePathname();
  if (isPathUnder(pathname, SCANNER_PATH)) return null;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-16 items-center gap-2 px-3">
        <form action={BOOKINGS_PATH} method="get" className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            name={QUERY_PARAM}
            aria-label={text.manualCode}
            placeholder={text.manualCode}
            autoComplete="off"
            autoCapitalize="characters"
            className="h-11 pl-9 font-mono uppercase"
          />
        </form>
        <Button asChild size="lg" className="h-12 shrink-0">
          <Link href={SCANNER_PATH}>
            <ScanLine aria-hidden />
            {text.scan}
          </Link>
        </Button>
      </div>
    </div>
  );
}
