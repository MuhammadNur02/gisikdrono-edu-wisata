import { Skeleton } from '@/components/ui/skeleton';
import { bookingHubLoadingCopy } from '@/lib/copy/booking-hub';

// DESIGN-SPEC §3.11: the status card, the timeline and the side cards in their places while the hub loads. The page
// shows it inside its own Suspense, after the link check, so an unknown or forged link still answers a real 404: a
// segment loading.tsx would start the response first and turn notFound() into a 200 (docs/Security.md GUEST-02).
export function HubSkeleton() {
  return (
    <div className="flex w-full max-w-300 flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <p role="status" className="sr-only">
        {bookingHubLoadingCopy}
      </p>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <div className="flex flex-col gap-6 lg:w-95 lg:shrink-0">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  );
}
