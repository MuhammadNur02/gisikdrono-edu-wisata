import { Skeleton } from '@/components/ui/skeleton';

// docs/StyleGuide.md §6.9: the overview's final shape while its figures load (the heading, the KPI ledger, two rows of
// panels), pulse only, so nothing moves when the numbers arrive.
export function OverviewSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      <Skeleton className="h-14 w-2/3 rounded-lg" />
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-xl lg:col-span-2" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
