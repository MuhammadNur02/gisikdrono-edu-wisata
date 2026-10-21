'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NavLinkLabel } from '@/components/layout/nav-link-label';
import type { PublicNavItem } from '@/config/nav';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { isPathUnder, visitorPathFor } from '@/lib/utils/paths';

// The current page gets the same 2 px primary underline as the public tabs (docs/StyleGuide.md §5.5),
// not a filled pill, so the booking button stays the strongest thing in the header.
export interface HeaderNavProps {
  items: readonly PublicNavItem[];
  className?: string;
}

export function HeaderNav({ items, className }: HeaderNavProps) {
  const pathname = visitorPathFor(usePathname());
  return (
    <nav aria-label={copy.layout.mainNav} className={className}>
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const isCurrent = isPathUnder(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-11 items-center rounded-lg px-3 text-body-sm font-medium transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0',
                  isCurrent
                    ? 'text-foreground after:opacity-100'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <NavLinkLabel item={item} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
