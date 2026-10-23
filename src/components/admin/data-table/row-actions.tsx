'use client';

import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { copy } from '@/lib/copy/id';

export interface RowActionItem {
  label: string;
  icon?: LucideIcon;
  // A link to a page, or something to do in place (open a sheet, run an action).
  href?: string;
  onSelect?: () => void;
  // Shown last and in red (docs/StyleGuide.md §6.4); the Server Action behind it re-checks scope.
  destructive?: boolean;
  disabled?: boolean;
}

export interface RowActionsProps {
  // What the menu is for, for the button's name: `Aksi baris Jelajah Ecowastreme`.
  name: string;
  items: readonly RowActionItem[];
}

function ActionItem({ item }: { item: RowActionItem }) {
  const Icon = item.icon;
  const content = (
    <>
      {Icon ? <Icon aria-hidden /> : null}
      {item.label}
    </>
  );
  const variant = item.destructive ? 'destructive' : 'default';
  if (item.href !== undefined) {
    return (
      <DropdownMenuItem asChild variant={variant} disabled={item.disabled}>
        <Link href={item.href}>{content}</Link>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem variant={variant} disabled={item.disabled} onSelect={item.onSelect}>
      {content}
    </DropdownMenuItem>
  );
}

// docs/StyleGuide.md §6.4: the `MoreHorizontal` menu at the end of a row; destructive items sit last, after a rule.
export function RowActions({ name, items }: RowActionsProps) {
  const ordinary = items.filter((item) => !item.destructive);
  const destructive = items.filter((item) => item.destructive);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${copy.dashboard.table.rowActions} ${name}`}
          className="size-9 max-md:size-11"
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {ordinary.map((item) => (
          <ActionItem key={item.label} item={item} />
        ))}
        {ordinary.length > 0 && destructive.length > 0 ? <DropdownMenuSeparator /> : null}
        {destructive.map((item) => (
          <ActionItem key={item.label} item={item} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
