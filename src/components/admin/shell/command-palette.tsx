'use client';

import { CalendarClock, ClipboardList, ScanLine } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { BOOKINGS_PATH, SCANNER_PATH, SESSIONS_PATH } from '@/config/dashboard';
import { copy } from '@/lib/copy/id';
import { isBookingCode } from '@/lib/utils/codes';

const text = copy.dashboard.commandMenu;

export interface CommandPaletteItem {
  group: string;
  label: string;
  href: string;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The menu of this staff member, flattened; grouped again here by nav group.
  items: readonly CommandPaletteItem[];
}

function groupsOf(items: readonly CommandPaletteItem[]): [string, CommandPaletteItem[]][] {
  const groups = new Map<string, CommandPaletteItem[]>();
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  return [...groups.entries()];
}

// A typed booking code becomes a search of the bookings list.
function bookingCodeOf(query: string): string | null {
  const code = query.trim().toUpperCase();
  return isBookingCode(code) ? code : null;
}

type Go = (href: string) => void;

function QuickActions({ bookingCode, go }: { bookingCode: string | null; go: Go }) {
  return (
    <CommandGroup heading={text.quickActions}>
      {bookingCode ? (
        <CommandItem
          value={`reservasi ${bookingCode}`}
          onSelect={() => {
            go(`${BOOKINGS_PATH}?${new URLSearchParams({ q: bookingCode }).toString()}`);
          }}
        >
          <ClipboardList aria-hidden />
          {text.findBooking(bookingCode)}
        </CommandItem>
      ) : null}
      <CommandItem
        onSelect={() => {
          go(SCANNER_PATH);
        }}
      >
        <ScanLine aria-hidden />
        {text.openScanner}
      </CommandItem>
      <CommandItem
        onSelect={() => {
          go(SESSIONS_PATH);
        }}
      >
        <CalendarClock aria-hidden />
        {text.todaySessions}
      </CommandItem>
    </CommandGroup>
  );
}

function NavGroups({ items, go }: { items: readonly CommandPaletteItem[]; go: Go }) {
  return groupsOf(items).map(([group, groupItems]) => (
    <CommandGroup key={group} heading={group}>
      {groupItems.map((item) => (
        <CommandItem
          key={item.href}
          value={`${group} ${item.label}`}
          onSelect={() => {
            go(item.href);
          }}
        >
          {item.label}
        </CommandItem>
      ))}
    </CommandGroup>
  ));
}

// docs/StyleGuide.md §6.1: the cmdk palette, grouped by nav group, with the quick actions. Loaded on first open.
export function CommandPalette({ open, onOpenChange, items }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const go: Go = (href) => {
    onOpenChange(false);
    router.push(href);
  };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} className="rounded-2xl shadow-modal">
      <CommandInput
        placeholder={copy.ui.commandPlaceholder}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{copy.ui.commandEmpty}</CommandEmpty>
        <QuickActions bookingCode={bookingCodeOf(query)} go={go} />
        <NavGroups items={items} go={go} />
      </CommandList>
    </CommandDialog>
  );
}
