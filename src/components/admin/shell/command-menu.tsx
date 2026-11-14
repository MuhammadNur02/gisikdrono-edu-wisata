'use client';

import { Search } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

import type { CommandPaletteItem } from '@/components/admin/shell/command-palette';
import { copy } from '@/lib/copy/id';
import { isDashboardLocked } from '@/lib/utils/idle-lock';

const text = copy.dashboard.commandMenu;
const COMMAND_KEY = 'k';

// cmdk and its dialog load on the first open, so they stay out of every dashboard page's first load (Task P4.1.03).
const CommandPalette = dynamic(
  () => import('@/components/admin/shell/command-palette').then((module) => module.CommandPalette),
  { ssr: false },
);

export interface CommandMenuProps {
  items: readonly CommandPaletteItem[];
}

// The bar itself; on the icon rail only the magnifier stays.
function JumpBar({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-label={text.open}
      aria-keyshortcuts="Control+K Meta+K"
      title={`${text.open} (${text.shortcut})`}
      onClick={onOpen}
      className="flex min-h-11 w-full items-center gap-2 rounded-md border border-sidebar-border bg-card px-2.5 text-caption text-muted-foreground transition-colors outline-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring md:min-h-9"
    >
      <Search aria-hidden className="size-3.5 shrink-0" />
      <span className="flex-1 truncate text-left group-data-[collapsible=icon]:hidden">
        {text.jump}
      </span>
      <kbd className="rounded-sm border border-border-strong px-1.5 text-micro font-semibold group-data-[collapsible=icon]:hidden">
        {text.shortcut}
      </kbd>
    </button>
  );
}

// docs/StyleGuide.md §6.1: the `Lompat ke menu…` bar at the top of the sidebar and the Ctrl+K / ⌘K shortcut that open
// the palette.
export function CommandMenu({ items }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const show = () => {
    setHasOpened(true);
    setOpen(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The idle lock owns the screen (review of PR #31, item 2).
      if (isDashboardLocked()) return;
      if (event.key.toLowerCase() === COMMAND_KEY && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        show();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <>
      <JumpBar onOpen={show} />
      {hasOpened ? <CommandPalette open={open} onOpenChange={setOpen} items={items} /> : null}
    </>
  );
}
