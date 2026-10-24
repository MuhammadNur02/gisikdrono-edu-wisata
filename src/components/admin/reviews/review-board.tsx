'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MessageSquare, ShieldCheck, Star } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';

import { ContentBoard } from '@/components/admin/cms/content-board';
import { actionsColumn } from '@/components/admin/cms/content-columns';
import { ColumnHeader } from '@/components/admin/data-table/column-header';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { FormAlert } from '@/components/forms/form-alert';
import { RatingStars } from '@/components/reviews/rating-stars';
import { Badge } from '@/components/ui/badge';
import { rwLabel } from '@/config/rw';
import { reviewsCopy } from '@/lib/copy/reviews';
import { formatDateShort } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { ListFacet } from '@/types/data-table';
import type { ReviewAdmin } from '@/types/review';

const text = reviewsCopy.moderation;

// The dialog and its form load on the first opening, outside the list page's first load (admin budget).
const ModerationDialog = dynamic(() =>
  import('@/components/admin/reviews/moderation-dialog').then((module) => module.ModerationDialog),
);

export type ModerateAction = (values: unknown) => Promise<ActionResult<ReviewAdmin>>;

export interface ReviewBoardProps {
  rows: ReviewAdmin[];
  total: number;
  facets: readonly ListFacet[];
  // moderateReviewAction for the superadmin; null for an RW admin, who reads only.
  moderateAction: ModerateAction | null;
}

function reviewerOf(review: ReviewAdmin): string {
  return review.institutionName
    ? `${review.publicReviewerName} · ${review.institutionName}`
    : review.publicReviewerName;
}

function ReviewCell({ review }: { review: ReviewAdmin }) {
  return (
    <span className="block max-w-md space-y-1 whitespace-normal">
      <span className="block font-medium">{review.title ?? text.untitled}</span>
      <span className="line-clamp-2 block text-body-sm text-muted-foreground">{review.body}</span>
    </span>
  );
}

function describedColumns(): ColumnDef<ReviewAdmin>[] {
  return [
    {
      id: 'review',
      header: text.columns.review,
      cell: ({ row }) => <ReviewCell review={row.original} />,
      meta: { label: text.columns.review, card: 'title' },
    },
    {
      id: 'rating',
      accessorFn: (review) => review.rating,
      header: ({ column }) => <ColumnHeader column={column} title={text.columns.rating} />,
      cell: ({ row }) => <RatingStars rating={row.original.rating} />,
      meta: { label: text.columns.rating },
    },
    {
      id: 'reviewer',
      header: text.columns.reviewer,
      cell: ({ row }) => <span className="whitespace-normal">{reviewerOf(row.original)}</span>,
      meta: { label: text.columns.reviewer },
    },
    {
      id: 'rws',
      header: text.columns.rws,
      cell: ({ row }) => row.original.rwIds.map(rwLabel).join(', '),
      meta: { label: text.columns.rws },
    },
  ];
}

function stateColumns(): ColumnDef<ReviewAdmin>[] {
  return [
    {
      id: 'status',
      header: text.columns.status,
      cell: ({ row }) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <StatusBadge kind="review_status" value={row.original.status} />
          {row.original.isFeatured ? (
            <Badge variant="info">
              <Star aria-hidden />
              {text.featured}
            </Badge>
          ) : null}
        </span>
      ),
      meta: { label: text.columns.status, card: 'badge' },
    },
    {
      id: 'created_at',
      accessorFn: (review) => review.createdAt,
      header: ({ column }) => <ColumnHeader column={column} title={text.columns.createdAt} />,
      cell: ({ row }) => formatDateShort(row.original.createdAt),
      meta: { label: text.columns.createdAt },
    },
  ];
}

function reviewColumns(
  canModerate: boolean,
  open: (review: ReviewAdmin) => void,
): ColumnDef<ReviewAdmin>[] {
  return [
    ...describedColumns(),
    ...stateColumns(),
    actionsColumn<ReviewAdmin>(
      (review) => review.title ?? reviewerOf(review),
      (review) => [
        {
          label: canModerate ? text.moderate : text.open,
          icon: canModerate ? ShieldCheck : Eye,
          onSelect: () => {
            open(review);
          },
        },
      ],
    ),
  ];
}

// Task P4.3.07, docs/PRD.md FR-ADMIN-19: one page of reviews from the URL's query on the DataTable. The superadmin
// moderates each one in a ResponsiveDialog; an RW admin opens the same dialog to read the whole review.
export function ReviewBoard({ rows, total, facets, moderateAction }: ReviewBoardProps) {
  const [opened, setOpened] = useState<ReviewAdmin | null>(null);
  const canModerate = moderateAction !== null;
  const columns = useCallback(() => reviewColumns(canModerate, setOpened), [canModerate]);
  return (
    <>
      <ContentBoard
        title={text.title}
        description={text.description}
        add={null}
        notice={canModerate ? undefined : <FormAlert tone="info">{text.readOnlyNotice}</FormAlert>}
        columns={columns}
        rows={rows}
        total={total}
        noun={text.noun}
        facets={facets}
        searchPlaceholder={text.search}
        emptyState={
          <EmptyState icon={MessageSquare} title={text.empty} description={text.emptyHint} />
        }
      />
      {opened ? (
        <ModerationDialog
          review={opened}
          moderateAction={moderateAction}
          onClose={() => {
            setOpened(null);
          }}
        />
      ) : null}
    </>
  );
}
