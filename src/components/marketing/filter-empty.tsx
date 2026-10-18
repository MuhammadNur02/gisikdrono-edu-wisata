import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy/id';

// The catalogue islands clear their filter in place; /galeri clears it by going to the unfiltered address.
export type FilterEmptyProps = { message: string } & (
  { onClear: () => void } | { clearHref: string }
);

// The answer to a visitor's own filter, the one public empty state that speaks (docs/StyleGuide.md §6.9).
export function FilterEmpty(props: FilterEmptyProps) {
  return (
    <div
      role="status"
      className="space-y-3 rounded-xl border border-dashed border-border p-6 text-center"
    >
      <p className="text-body text-muted-foreground">{props.message}</p>
      {'clearHref' in props ? (
        <Button variant="outline" asChild>
          <Link href={props.clearHref}>{copy.catalogue.clearFilters}</Link>
        </Button>
      ) : (
        <Button variant="outline" onClick={props.onClear}>
          {copy.catalogue.clearFilters}
        </Button>
      )}
    </div>
  );
}
