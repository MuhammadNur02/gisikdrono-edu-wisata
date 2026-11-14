'use client';

import { ChevronDown } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';
import { isPathUnder } from '@/lib/utils/paths';

export interface NavGroupSectionProps {
  title: string;
  hrefs: readonly string[];
  startsOpen: boolean;
  // The group's menu, drawn on the server.
  children: ReactNode;
}

// docs/StyleGuide.md §6.1 (Dasbor Gelap): a sidebar group that folds under its heading. It is open while it holds the
// current page; on the icon rail every item shows, since a folded group would have no heading to open it by.
export function NavGroupSection({ title, hrefs, startsOpen, children }: NavGroupSectionProps) {
  const pathname = usePathname();
  const holdsCurrentPage = hrefs.some((href) => isPathUnder(pathname, href));
  const [isOpenByChoice, setIsOpenByChoice] = useState<boolean | null>(null);
  // The current page's group stays open, so the current item is never hidden.
  const isOpen = holdsCurrentPage || (isOpenByChoice ?? startsOpen);
  const listId = useId();
  return (
    <div className="pt-2">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={listId}
        onClick={() => {
          setIsOpenByChoice(!isOpen);
        }}
        className="flex min-h-11 w-full items-center gap-1.5 rounded-md px-2.5 text-micro font-semibold text-muted-foreground outline-none group-data-[collapsible=icon]:hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring md:min-h-7"
      >
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown
          aria-hidden
          className={cn('size-3.5 transition-transform', !isOpen && '-rotate-90')}
        />
      </button>
      <div id={listId} className={cn(!isOpen && 'hidden group-data-[collapsible=icon]:block')}>
        {children}
      </div>
    </div>
  );
}
