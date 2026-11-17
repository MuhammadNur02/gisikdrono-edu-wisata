import Link from 'next/link';

import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';
import { bookingViewHref } from '@/lib/utils/booking-list';
import { cn } from '@/lib/utils/cn';
import type { BookingViewCounts, BookingViewKey } from '@/types/booking-admin';

const text = bookingsAdminCopy.list.views;

const ORDER: readonly BookingViewKey[] = [
  'all',
  'under_review',
  'today',
  'pending_payment',
  'paid',
  'completed',
];

const numberFormat = new Intl.NumberFormat('id-ID');

export interface BookingViewsProps {
  active: BookingViewKey | null;
  counts: BookingViewCounts;
  today: string;
  // The superadmin's chosen RW, kept across the tabs.
  rw: number | null;
}

function ViewCount({ view, count }: { view: BookingViewKey; count: number | null }) {
  if (count === null) return null;
  const isUrgent = view === 'under_review' && count > 0;
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-px text-caption font-semibold tabular-nums',
        isUrgent
          ? 'bg-warning-soft text-warning-soft-foreground'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {numberFormat.format(count)}
    </span>
  );
}

// The saved views above the list (Dasbor Gelap): each a whole filter as a link, with how many bookings it holds. The
// current one is underlined in the accent; "Perlu ditinjau" turns amber while anything waits.
export function BookingViews({ active, counts, today, rw }: BookingViewsProps) {
  return (
    <nav aria-label={text.label} className="-mx-1 overflow-x-auto border-b border-border">
      <ul className="flex min-w-max gap-1 px-1">
        {ORDER.map((view) => (
          <li key={view}>
            <Link
              href={bookingViewHref(view, today, rw)}
              aria-current={view === active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-2 border-b-2 border-transparent px-2.5 text-caption font-medium text-ink-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:min-h-10',
                view === active && 'border-primary font-semibold text-foreground',
              )}
            >
              {text[view]}
              <ViewCount view={view} count={counts[view]} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
