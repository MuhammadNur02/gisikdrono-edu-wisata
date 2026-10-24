import type { Metadata } from 'next';

import { ReviewBoard } from '@/components/admin/reviews/review-board';
import { RATING_VALUES } from '@/config/reviews';
import { REVIEW_STATUS } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { reviewsCopy } from '@/lib/copy/reviews';
import { listFacets, rwFacet } from '@/lib/utils/facets';
import { loadListQuery } from '@/lib/utils/list-query';
import { moderateReviewAction } from '@/server/actions/reviews';
import { effectiveRw } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listReviewsForStaff } from '@/server/services/review-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import type { ListFacet } from '@/types/data-table';

const text = reviewsCopy.moderation;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUS_FACET: ListFacet = {
  param: 'status',
  title: text.facets.status,
  options: DB_ENUMS.review_status.map((status) => ({
    value: status,
    label: REVIEW_STATUS[status].label,
  })),
};

// `?category=` names one rating: the list query has one single-select facet.
const RATING_FACET: ListFacet = {
  param: 'category',
  title: text.facets.rating,
  options: RATING_VALUES.map((rating) => ({
    value: String(rating),
    label: text.ratingOption(rating),
  })),
};

// Task P4.3.07, docs/PRD.md §5 and FR-ADMIN-19: the superadmin moderates every review; an RW admin reads their own RW's
// (reviews_staff_read), with no RW facet and no moderation action. One page from `?q=&sort=&page=&status=&category=&rw=`.
export default async function ReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const query = await loadListQuery(searchParams);
  const isSuperadmin = ctx.role === 'superadmin';
  const [rw, rwUnits] = await Promise.all([effectiveRw(ctx, query.rw), listRwUnitsForStaff()]);
  const result = await listReviewsForStaff(query, rw);
  const facets = listFacets(isSuperadmin, {
    status: STATUS_FACET,
    others: [RATING_FACET],
    rw: rwFacet(text.facets.rw, rwUnits),
  });

  return (
    <ReviewBoard
      rows={result.rows}
      total={result.total}
      facets={facets}
      moderateAction={isSuperadmin ? moderateReviewAction : null}
    />
  );
}
