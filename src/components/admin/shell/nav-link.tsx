'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';
import { isPathUnder } from '@/lib/utils/paths';

export interface NavLinkProps {
  href: string;
  // The overview item is current on its own page only.
  exact: boolean;
  // Items below this one, current on their own pages instead (dashboardNavFor's nestedHrefs).
  nested: readonly string[];
  children: ReactNode;
}

// docs/StyleGuide.md §6.1: hover and active states in CSS only, the current item with a 3 px bar on its left.
export function NavLink({ href, exact, nested, children }: NavLinkProps) {
  const pathname = usePathname();
  const isCurrent = exact
    ? pathname === href
    : isPathUnder(pathname, href) && !nested.some((deeper) => isPathUnder(pathname, deeper));
  return (
    <Link
      href={href}
      aria-current={isCurrent ? 'page' : undefined}
      className={cn(
        'relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-body-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:min-h-10',
        isCurrent &&
          'bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.75 before:rounded-full before:bg-sidebar-primary',
      )}
    >
      {children}
    </Link>
  );
}
