'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { SidebarMenuButton } from '@/components/ui/sidebar';
import { useSidebar } from '@/hooks/use-sidebar';
import { isPathUnder } from '@/lib/utils/paths';

export interface NavMenuButtonProps {
  href: string;
  label: string;
  // The overview item is current on its own page only.
  exact: boolean;
  // Items below this one, current on their own pages instead (dashboardNavFor's nestedHrefs).
  nested: readonly string[];
  // The icon and label, drawn on the server.
  children: ReactNode;
}

// docs/StyleGuide.md §6.1: hover and active states in CSS only, the current item with a 3 px bar on its left and a
// tooltip on the icon rail. The one piece of client state is which item is current.
export function NavMenuButton({ href, label, exact, nested, children }: NavMenuButtonProps) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const isCurrent = exact
    ? pathname === href
    : isPathUnder(pathname, href) && !nested.some((deeper) => isPathUnder(pathname, deeper));
  return (
    <SidebarMenuButton
      asChild
      isActive={isCurrent}
      tooltip={label}
      className="data-[active=true]:before:absolute data-[active=true]:before:inset-y-2 data-[active=true]:before:left-0 data-[active=true]:before:w-0.75 data-[active=true]:before:rounded-full data-[active=true]:before:bg-sidebar-primary group-data-[collapsible=icon]:data-[active=true]:before:hidden"
    >
      <Link
        href={href}
        aria-current={isCurrent ? 'page' : undefined}
        // Below md the sidebar is a sheet, which closes as the page changes (review of PR #31, item 3).
        onClick={() => {
          setOpenMobile(false);
        }}
      >
        {children}
      </Link>
    </SidebarMenuButton>
  );
}
