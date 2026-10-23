'use client';

import { Search } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

import type { CommandPaletteItem } from '@/components/admin/shell/command-palette';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy/id';

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

// docs/StyleGuide.md §6.1: the search button of the topbar and the Ctrl+K / ⌘K shortcut that open the palette.
export function CommandMenu({ items }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const show = () => {
    setHasOpened(true);
    setOpen(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={text.open}
        aria-keyshortcuts="Control+K Meta+K"
        title={`${text.open} (${text.shortcut})`}
        onClick={show}
      >
        <Search aria-hidden />
      </Button>
      {hasOpened ? <CommandPalette open={open} onOpenChange={setOpen} items={items} /> : null}
    </>
  );
}
