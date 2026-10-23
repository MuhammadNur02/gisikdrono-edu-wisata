import { Container } from '@/components/layout/container';
import { Skeleton } from '@/components/ui/skeleton';

// Eight tiles: enough to fill the first screen of the masonry grid at every width (src/components/gallery/masonry-grid.tsx).
const TILE_COUNT = 8;

// docs/StyleGuide.md §6.9: the shape of the gallery (its filter row, then the tiles) while the items are fetched
// inside the Suspense boundary of src/app/(public)/(rows)/galeri/page.tsx (review of Task P5.6.05).
export function GallerySkeleton() {
  return (
    <Container aria-busy="true" className="space-y-8 pb-16 md:pb-24">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: TILE_COUNT }, (_, index) => (
          <Skeleton key={index} className="aspect-4/5 w-full rounded-xl" />
        ))}
      </div>
    </Container>
  );
}
