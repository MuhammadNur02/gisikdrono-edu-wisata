import { Skeleton } from '@/components/ui/skeleton';

const KPI_COUNT = 4;
const KPI_KEYS = Array.from({ length: KPI_COUNT }, (_, index) => `kpi-${String(index)}`);

// docs/StyleGuide.md §6.9: the overview's final shape while its figures load (four KPI cards, two chart cards),
// pulse only, so nothing moves when the numbers arrive.
export function OverviewSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPI_KEYS.map((key) => (
          <Skeleton key={key} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
