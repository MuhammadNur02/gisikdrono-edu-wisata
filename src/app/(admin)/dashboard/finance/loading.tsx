import { Skeleton } from '@/components/ui/skeleton';

const KPI_COUNT = 4;
const KPI_KEYS = Array.from({ length: KPI_COUNT }, (_, index) => `kpi-${String(index)}`);

// docs/StyleGuide.md §6.9: the recap's final shape while it loads (header, period, four figures, chart, table).
export default function FinanceLoading() {
  return (
    <div aria-hidden className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-full max-w-lg" />
      </div>
      <Skeleton className="h-20 w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPI_KEYS.map((key) => (
          <Skeleton key={key} className="h-32 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
