'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { DASHBOARD_PATH } from '@/config/auth';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { isBookingCode } from '@/lib/utils/codes';

const text = copy.dashboard;
const SEGMENT_LABELS: Record<string, string> = text.topbar.segments;

export interface BreadcrumbItem {
  href: string;
  label: string;
}

interface Crumb {
  href: string;
  label: string;
}

// A crumb for each path segment that has a name: a menu item, `Baru` / `Ubah`, or a booking code. Row ids have no
// name and are left out, so `/dashboard/articles/<id>/edit` reads `Dasbor / Artikel / Ubah`.
function crumbsFor(pathname: string, items: readonly BreadcrumbItem[]): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [];
  let href = '';
  for (const segment of segments) {
    href += `/${segment}`;
    if (href === DASHBOARD_PATH) continue;
    const item = items.find((candidate) => candidate.href === href);
    const label =
      item?.label ?? SEGMENT_LABELS[segment] ?? (isBookingCode(segment) ? segment : null);
    if (label !== null) crumbs.push({ href, label });
  }
  return crumbs;
}

// The page itself is text; every crumb before it is a link. Only the last crumb stays below sm.
function CrumbLabel({ crumb, isLast }: { crumb: Crumb; isLast: boolean }) {
  if (isLast) {
    return (
      <span aria-current="page" className="truncate font-medium text-foreground">
        {crumb.label}
      </span>
    );
  }
  return (
    <Link href={crumb.href} className="rounded-md hover:text-foreground">
      {crumb.label}
    </Link>
  );
}

// docs/StyleGuide.md §6.1: `Dasbor / Reservasi / GSK-7F3K9Q2M` in the topbar; the last crumb is the page itself.
export function Breadcrumbs({ items }: { items: readonly BreadcrumbItem[] }) {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname, items);
  const lastIndex = crumbs.length - 1;
  const home: Crumb = { href: DASHBOARD_PATH, label: text.home.title };
  return (
    <nav aria-label={text.topbar.breadcrumb} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-body-sm text-muted-foreground">
        <li className="shrink-0">
          <CrumbLabel crumb={home} isLast={crumbs.length === 0} />
        </li>
        {crumbs.map((crumb, index) => (
          <li
            key={crumb.href}
            className={cn(
              'flex min-w-0 items-center gap-1',
              index === lastIndex ? 'truncate' : 'hidden shrink-0 sm:flex',
            )}
          >
            <ChevronRight aria-hidden className="size-3.5 shrink-0" />
            <CrumbLabel crumb={crumb} isLast={index === lastIndex} />
          </li>
        ))}
      </ol>
    </nav>
  );
}
