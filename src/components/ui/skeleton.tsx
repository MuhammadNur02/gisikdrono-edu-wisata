import { cn } from '@/lib/utils/cn';

// DESIGN-SPEC §3.14: the sunken fill, with a shimmer that only starts after 300 ms so a quick answer never flashes it.
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="skeleton" className={cn('skeleton-shimmer rounded-md', className)} {...props} />
  );
}

export { Skeleton };
