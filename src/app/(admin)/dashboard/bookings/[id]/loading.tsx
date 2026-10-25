import { Skeleton } from '@/components/ui/skeleton';

// docs/StyleGuide.md §6.9: the booking's final shape while it loads (header, the main cards, the side cards).
export default function BookingDetailLoading() {
  return (
    <div aria-hidden className="flex flex-col gap-6">
      <Skeleton className="h-11 w-48" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-full max-w-sm" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
