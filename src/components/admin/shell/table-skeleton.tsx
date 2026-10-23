import { Skeleton } from '@/components/ui/skeleton';

// docs/StyleGuide.md §6.4, §6.9: eight rows with the table's final dimensions, pulse only.
const SKELETON_ROWS = 8;
const SKELETON_COLUMNS = 5;
// Column widths of a typical list: name, two short facts, a status and the actions, as fractions of twelve.
const COLUMN_SPANS = [
  'col-span-5',
  'col-span-2',
  'col-span-2',
  'col-span-2',
  'col-span-1',
] as const;

function SkeletonRow() {
  return (
    <div className="grid h-12 grid-cols-12 items-center gap-4 border-b border-border px-4 last:border-0">
      {COLUMN_SPANS.slice(0, SKELETON_COLUMNS).map((span, index) => (
        <Skeleton key={index} className={`h-4 ${span}`} />
      ))}
    </div>
  );
}

export interface TableSkeletonProps {
  rows?: number;
}

// The loading state of every list page: the page header's title line, the toolbar and the rows.
export function TableSkeleton({ rows = SKELETON_ROWS }: TableSkeletonProps) {
  return (
    <div className="space-y-6" aria-busy aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="h-12 border-b border-border bg-muted/50" />
        {Array.from({ length: rows }, (_row, index) => (
          <SkeletonRow key={index} />
        ))}
      </div>
    </div>
  );
}
