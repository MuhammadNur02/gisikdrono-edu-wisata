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

// docs/StyleGuide.md §6.1 (Dasbor Gelap): hover and active states in CSS only, the current item on the raised fill in
// full ink with its icon in the accent, and a tooltip on the icon rail. The one piece of client state is which item is
// current. 44 px tall below md, where the sidebar is a sheet under a finger; 32 px from md up.
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
      className="h-auto min-h-11 gap-2.5 px-2.5 text-caption font-medium text-sidebar-foreground data-[active=true]:font-medium data-[active=true]:text-foreground md:min-h-8 [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-sidebar-primary"
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
