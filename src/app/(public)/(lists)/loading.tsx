import { Container } from '@/components/layout/container';
import { Skeleton } from '@/components/ui/skeleton';

// docs/StyleGuide.md §6.9: a skeleton in the shape of what is coming. Public pages are prerendered, so this
// shows only on a slow client-side navigation or while an ISR page renders for the first time.
export default function PublicLoading() {
  return (
    <div aria-busy="true" className="py-10 md:py-16">
      <Container className="space-y-10">
        <Skeleton className="aspect-4/5 w-full rounded-2xl md:aspect-video" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-3/4 max-w-xl" />
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="aspect-4/3 w-full rounded-xl" />
          <Skeleton className="aspect-4/3 w-full rounded-xl" />
          <Skeleton className="aspect-4/3 w-full rounded-xl" />
        </div>
      </Container>
    </div>
  );
}
