import { Container } from '@/components/layout/container';
import { Skeleton } from '@/components/ui/skeleton';
import { catalogueStateCopy } from '@/lib/copy/catalogue-ui';
import { cn } from '@/lib/utils/cn';

// Eight tiles of mixed heights, enough to fill the first screen of the masonry grid at every width
// (src/components/gallery/masonry-grid.tsx), so the columns look like the photos that will fill them.
const TILE_ASPECTS = [
  'aspect-4/3',
  'aspect-3/4',
  'aspect-square',
  'aspect-4/3',
  'aspect-3/4',
  'aspect-4/3',
  'aspect-square',
  'aspect-3/4',
] as const;
const CHIP_WIDTHS = ['w-24', 'w-21', 'w-21', 'w-21', 'w-21', 'w-28'] as const;

// DESIGN-SPEC §3.14 for the gallery: the filter row and the masonry tiles while the items are fetched inside the
// Suspense boundary of src/app/(public)/(rows)/galeri/page.tsx (review of Task P5.6.05).
export function GallerySkeleton() {
  return (
    <Container aria-busy="true" className="space-y-8 pb-16 md:space-y-12 md:pb-28">
      <p role="status" className="sr-only">
        {catalogueStateCopy.loading('foto')}
      </p>
      <div aria-hidden className="flex gap-2 overflow-hidden">
        {CHIP_WIDTHS.map((width, index) => (
          <Skeleton key={index} className={cn('h-11 shrink-0 rounded-full md:h-10', width)} />
        ))}
      </div>
      <div aria-hidden className="columns-2 gap-3 md:columns-3 md:gap-6 lg:columns-4">
        {TILE_ASPECTS.map((aspect, index) => (
          <Skeleton
            key={index}
            className={cn('mb-3 w-full break-inside-avoid rounded-lg md:mb-6', aspect)}
          />
        ))}
      </div>
    </Container>
  );
}
