import {
  ChevronRight,
  CircleCheck,
  MessageSquare,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';

import { OverviewPanel } from '@/components/admin/overview/overview-panel';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { UNDER_REVIEW_VIEW } from '@/config/bookings';
import { BOOKINGS_PATH } from '@/config/dashboard';
import { REVIEWS_DASHBOARD_PATH } from '@/config/reviews';
import { SECURITY_ALERTS_PATH } from '@/config/staff';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import type { NeedsActionItem, NeedsActionKind } from '@/types/dashboard-stats';

const text = copy.dashboard.overview;

// The bookings list filtered to those held for review.
const BOOKINGS_UNDER_REVIEW_PATH = `${BOOKINGS_PATH}?category=${UNDER_REVIEW_VIEW}`;

const KINDS: Record<NeedsActionKind, { icon: LucideIcon; tone: string; href: string }> = {
  booking_review: {
    icon: TriangleAlert,
    tone: 'bg-danger-soft text-danger-soft-foreground',
    href: BOOKINGS_UNDER_REVIEW_PATH,
  },
  security_alerts: {
    icon: ShieldAlert,
    tone: 'bg-warning-soft text-warning-soft-foreground',
    href: SECURITY_ALERTS_PATH,
  },
  pending_reviews: {
    icon: MessageSquare,
    tone: 'bg-info-soft text-info-soft-foreground',
    href: REVIEWS_DASHBOARD_PATH,
  },
};

function wordsOf(item: NeedsActionItem): { title: string; detail: string } {
  if (item.kind === 'booking_review') {
    return {
      title: text.actions.bookingReview(item.count, item.detail),
      detail: text.actions.bookingReviewDetail,
    };
  }
  if (item.kind === 'security_alerts') {
    return {
      title: text.actions.securityAlerts(item.count),
      detail: text.actions.securityAlertsDetail(item.detail),
    };
  }
  return {
    title: text.actions.pendingReviews(item.count),
    detail: text.actions.pendingReviewsDetail,
  };
}

function ActionRow({ item }: { item: NeedsActionItem }) {
  const kind = KINDS[item.kind];
  const Icon = kind.icon;
  const words = wordsOf(item);
  return (
    <li>
      <Link
        href={kind.href}
        className="flex min-h-11 items-center gap-3 px-4 py-3.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:px-5"
      >
        <span
          className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', kind.tone)}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-caption font-semibold text-foreground">{words.title}</span>
          {words.detail ? (
            <span className="text-caption text-muted-foreground">{words.detail}</span>
          ) : null}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

export interface ActionPanelProps {
  actions: NeedsActionItem[] | null;
  // Today's contact reveals, the superadmin's audit note under the list (DATA-04); null for an RW officer.
  piiRevealsToday: number | null;
}

// "Perlu tindakan" (Dasbor Gelap): what waits on this staff member, most urgent first, each a link to where it is done.
export function ActionPanel({ actions, piiRevealsToday }: ActionPanelProps) {
  return (
    <OverviewPanel title={text.actions.title} description={text.actions.description}>
      {actions === null ? (
        <EmptyState icon={CircleCheck} {...text.chartUnavailable} />
      ) : actions.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-5 text-caption text-muted-foreground md:px-5">
          <CircleCheck aria-hidden className="size-4 text-success" />
          {text.actions.none}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {actions.map((item) => (
            <ActionRow key={item.kind} item={item} />
          ))}
        </ul>
      )}
      {piiRevealsToday === null ? null : (
        <p className="border-t px-4 py-3 text-caption text-muted-foreground md:px-5">
          {text.actions.piiReveals(piiRevealsToday)}
        </p>
      )}
    </OverviewPanel>
  );
}
