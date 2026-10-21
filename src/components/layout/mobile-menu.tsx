'use client';

import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NavLinkLabel } from '@/components/layout/nav-link-label';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { PublicNavGroup } from '@/config/nav';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { isPathUnder } from '@/lib/utils/paths';

function MenuGroup({ group, pathname }: { group: PublicNavGroup; pathname: string }) {
  return (
    <div className="space-y-2">
      <p className="px-3 text-overline text-muted-foreground">{group.title}</p>
      <ul>
        {group.items.map((item) => {
          const isCurrent = isPathUnder(pathname, item.href);
          return (
            <li key={item.href}>
              {/* Closing on tap matters because a client navigation keeps the sheet mounted. */}
              <SheetClose asChild>
                <Link
                  href={item.href}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center rounded-lg px-3 py-2 text-body font-medium transition-colors hover:bg-accent',
                    isCurrent && 'bg-accent text-accent-foreground',
                  )}
                >
                  <NavLinkLabel item={item} />
                </Link>
              </SheetClose>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Below xl the header has no room for every link, so they move into a sheet (docs/StyleGuide.md §10.2).
export interface MobileMenuProps {
  groups: readonly PublicNavGroup[];
  className?: string;
}

export function MobileMenu({ groups, className }: MobileMenuProps) {
  const pathname = usePathname();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={copy.layout.openMenu} className={className}>
          <Menu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="gap-0 overflow-y-auto">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{copy.layout.menuTitle}</SheetTitle>
          <SheetDescription className="sr-only">{copy.layout.menuDescription}</SheetDescription>
        </SheetHeader>
        <nav aria-label={copy.layout.mainNav} className="space-y-6 p-4">
          {groups.map((group) => (
            <MenuGroup key={group.title} group={group} pathname={pathname} />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
