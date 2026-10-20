'use client';

import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { copy } from '@/lib/copy/id';

export interface MobileSidebarProps {
  // The same DashboardNav the sidebar shows, rendered on the server.
  children: ReactNode;
  footer: ReactNode;
}

const text = copy.dashboard;

// Below md the sidebar becomes a sheet from the left (docs/StyleGuide.md §6.1). It remembers the page it was opened
// on, so moving to another page closes it without an effect.
export function MobileSidebar({ children, footer }: MobileSidebarProps) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  return (
    <Sheet
      open={openOn === pathname}
      onOpenChange={(isOpen) => {
        setOpenOn(isOpen ? pathname : null);
      }}
    >
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={text.openMenu} className="md:hidden">
          <Menu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground">
        <SheetHeader className="border-b border-sidebar-border px-5 py-4">
          <SheetTitle>{text.navLabel}</SheetTitle>
          <SheetDescription className="sr-only">{text.menuDescription}</SheetDescription>
        </SheetHeader>
        <nav aria-label={text.navLabel} className="flex-1 overflow-y-auto px-3 py-4">
          {children}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border p-3">{footer}</div>
      </SheetContent>
    </Sheet>
  );
}
