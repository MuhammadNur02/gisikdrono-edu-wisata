import { Container } from '@/components/layout/container';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';

// The loading frames of DESIGN-SPEC §3.14: the page head and the filter bar keep their place, and the cards are drawn
// in their exact geometry (media, meta, title, two lines, the footer), so nothing jumps when the data arrives. The
// shimmer starts only after 300 ms (skeleton-shimmer), so a quick answer never flashes it.

export type CardSkeletonKind = 'package' | 'product' | 'article';

const MEDIA_ASPECT: Record<CardSkeletonKind, string> = {
  package: 'aspect-4/3',
  product: 'aspect-square',
  article: 'aspect-16/10',
};

export function CardSkeleton({ kind }: { kind: CardSkeletonKind }) {
  return (
    <div aria-hidden className="w-full">
      <Skeleton className={cn('w-full rounded-lg', MEDIA_ASPECT[kind])} />
      <div className="space-y-3 pt-5">
        <Skeleton className="h-3 w-30" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/5" />
        {kind === 'package' ? (
          <div className="flex items-center justify-between border-t border-border pt-4">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-21" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export interface CardGridSkeletonProps {
  kind: CardSkeletonKind;
  // Three on a wide screen; phones show the first two (DESIGN-SPEC §3.14 mobile).
  count: number;
  listClassName: string;
}

export function CardGridSkeleton({ kind, count, listClassName }: CardGridSkeletonProps) {
  const PHONE_CARDS = 2;
  return (
    <div className={listClassName}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={cn('flex', index >= PHONE_CARDS && 'max-md:hidden')}>
          <CardSkeleton kind={kind} />
        </div>
      ))}
    </div>
  );
}

const CHIP_WIDTHS = ['w-36', 'w-21', 'w-21', 'w-28'] as const;

function StillPill({ className }: { className?: string }) {
  return <span className={cn('block bg-muted', className)} />;
}

// The filter bar while the list loads: its chips as pills and the count as a 64 x 14 bar. `isStill` draws the same
// shapes without the shimmer, for the error state, where nothing is loading.
export function FilterBarSkeleton({ isStill = false }: { isStill?: boolean }) {
  const Pill = isStill ? StillPill : Skeleton;
  return (
    <div aria-hidden className="border-y border-border">
      <Container className="flex items-center gap-2 overflow-hidden py-3 md:py-5">
        {CHIP_WIDTHS.map((width, index) => (
          <Pill key={index} className={cn('h-11 shrink-0 rounded-full md:h-10', width)} />
        ))}
        <Pill className="ml-auto h-3.5 w-16 rounded-md max-md:hidden" />
      </Container>
    </div>
  );
}

export interface ListLoadingProps {
  title: string;
  // Read out once by screen readers: `Memuat paket…`.
  announcement: string;
  kind: CardSkeletonKind;
  count: number;
  listClassName: string;
}

// The whole loading frame of a catalogue list: the head with its real title, the bar, the cards.
export function ListLoading({ title, announcement, kind, count, listClassName }: ListLoadingProps) {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <Container className="pt-8 pb-8 md:pt-18 md:pb-12">
        <p className="text-display text-balance">{title}</p>
      </Container>
      <FilterBarSkeleton />
      <Container className="pt-8 pb-16 md:pt-12">
        <CardGridSkeleton kind={kind} count={count} listClassName={listClassName} />
      </Container>
    </div>
  );
}
