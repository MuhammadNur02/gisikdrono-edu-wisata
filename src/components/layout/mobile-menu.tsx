'use client';

import { Menu } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import type { PublicNavGroup } from '@/config/public-nav';
import { layoutCopy } from '@/lib/copy/ui';
import { cn } from '@/lib/utils/cn';

const loadDrawer = () =>
  import('@/components/layout/menu-drawer').then((module) => module.MenuDrawer);

// The drawer (and Radix Dialog with it) loads on first use, not with the page: pointing at or focusing the button
// starts the download, so by the tap it is usually there (first-load budget, docs/StyleGuide.md §10.1).
const MenuDrawer = dynamic(loadDrawer);

function prefetchDrawer() {
  void loadDrawer();
}

export interface MobileMenuProps {
  groups: readonly PublicNavGroup[];
  className?: string;
}

// The 44 px round menu button of the header below lg (DESIGN-SPEC §2.7), in the header's own colours.
export function MobileMenu({ groups, className }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={layoutCopy.openMenu}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={prefetchDrawer}
        onFocus={prefetchDrawer}
        onClick={() => {
          setHasOpened(true);
          setOpen(true);
        }}
        className={cn(
          'inline-flex size-11 press-scale items-center justify-center rounded-full border border-header-line text-header-fg hover:bg-header-fg/10',
          className,
        )}
      >
        <Menu aria-hidden className="size-5" />
      </button>
      {hasOpened ? <MenuDrawer groups={groups} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
