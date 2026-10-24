import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { securityCopy } from '@/lib/copy/security';

// Previous and next for a list read newest first without a count (Task P4.10.02). The other filters stay in the URL.
function hrefFor(
  basePath: string,
  params: Record<string, string | undefined>,
  page: number,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  query.set('page', String(page));
  return `${basePath}?${query.toString()}`;
}

export function PageLinks({
  basePath,
  params,
  page,
  hasNext,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  hasNext: boolean;
}) {
  if (page === 1 && !hasNext) return null;
  return (
    <nav aria-label={securityCopy.pagination} className="flex items-center justify-between gap-2">
      {page > 1 ? (
        <Button asChild variant="outline">
          <Link href={hrefFor(basePath, params, page - 1)}>
            <ChevronLeft aria-hidden />
            {securityCopy.previous}
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-body-sm text-muted-foreground">{securityCopy.page(page)}</span>
      {hasNext ? (
        <Button asChild variant="outline">
          <Link href={hrefFor(basePath, params, page + 1)}>
            {securityCopy.next}
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
