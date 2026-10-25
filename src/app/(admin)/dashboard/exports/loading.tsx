import { Skeleton } from '@/components/ui/skeleton';

const ROW_COUNT = 6;
const ROW_KEYS = Array.from({ length: ROW_COUNT }, (_, index) => `row-${String(index)}`);

// docs/StyleGuide.md §6.9: the page's final shape while it loads (header, the toolbar, a table of six rows).
export default function ExportsLoading() {
  return (
    <div aria-hidden className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-full max-w-md" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-11 w-full" />
        {ROW_KEYS.map((key) => (
          <Skeleton key={key} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
