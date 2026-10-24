'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NavLinkLabel } from '@/components/layout/nav-link-label';
import { isCurrentNavItem, type PublicNavItem } from '@/config/public-nav';
import { layoutCopy } from '@/lib/copy/ui';
import { cn } from '@/lib/utils/cn';
import { visitorPathFor } from '@/lib/utils/paths';

// DESIGN-SPEC §2.7: 15/500 links 36 px apart (24 at lg), in the header's own colours (white over the hero photo,
// ink-2 once solid). The current page, and a link while pointed at, is underlined in its text colour, 2 px, 6 px below
// the words; the line draws from the left (§4, Nav link). No filled pill, so the booking button stays the strongest.
export interface HeaderNavProps {
  items: readonly PublicNavItem[];
  className?: string;
}

export function HeaderNav({ items, className }: HeaderNavProps) {
  const pathname = visitorPathFor(usePathname());
  return (
    <nav aria-label={layoutCopy.mainNav} className={className}>
      <ul className="flex items-center gap-6 xl:gap-9">
        {items.map((item) => {
          const isCurrent = isCurrentNavItem(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                // A section link stands for the pages under it, so it marks the current section, not the page.
                aria-current={isCurrent ? (item.currentOn ? 'true' : 'page') : undefined}
                className={cn(
                  'relative flex min-h-11 items-center text-label font-medium transition-colors duration-200 ease-out-soft after:absolute after:inset-x-0 after:bottom-1.5 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-current after:transition-transform after:duration-200 after:ease-out-soft hover:text-header-fg hover:after:scale-x-100',
                  isCurrent ? 'text-header-fg after:scale-x-100' : 'text-header-fg-2',
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
