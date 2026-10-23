'use client';

import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy/id';

const text = copy.dashboard.table;
// docs/StyleGuide.md §6.4: the floating bar offers at most three actions.
const MAX_BULK_ACTIONS = 3;

export interface BulkAction {
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  // Called with the ids of the selected rows; the Server Action behind it re-checks every one.
  onSelect: (ids: string[]) => void;
}

export interface BulkActionsProps {
  selectedIds: string[];
  actions: readonly BulkAction[];
  onClear: () => void;
}

function BulkActionButton({ action, selectedIds }: { action: BulkAction; selectedIds: string[] }) {
  const Icon = action.icon;
  return (
    <Button
      type="button"
      size="sm"
      variant={action.destructive ? 'destructive' : 'secondary'}
      onClick={() => {
        action.onSelect(selectedIds);
      }}
    >
      {Icon ? <Icon aria-hidden /> : null}
      {action.label}
    </Button>
  );
}

// docs/StyleGuide.md §6.4: a floating bar at the bottom centre while rows are selected, with the count and the
// actions; it disappears on clear. Above the QuickScannerBar below md.
export function BulkActions({ selectedIds, actions, onClear }: BulkActionsProps) {
  if (selectedIds.length === 0) return null;
  return (
    <div
      role="region"
      aria-live="polite"
      aria-label={text.bulkSelected(selectedIds.length)}
      className="fixed inset-x-4 bottom-20 z-30 flex items-center gap-2 overflow-x-auto rounded-2xl border border-border bg-background/90 p-2 pl-4 shadow-modal backdrop-blur md:inset-x-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2"
    >
      <span className="text-body-sm font-medium whitespace-nowrap tabular-nums">
        {text.bulkSelected(selectedIds.length)}
      </span>
      {actions.slice(0, MAX_BULK_ACTIONS).map((action) => (
        <BulkActionButton key={action.label} action={action} selectedIds={selectedIds} />
      ))}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={text.clearSelection}
        onClick={onClear}
      >
        <X aria-hidden />
      </Button>
    </div>
  );
}
