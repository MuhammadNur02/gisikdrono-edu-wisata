import 'server-only';

import { RATING_VALUES, REVIEW_DEFAULT_SORT, REVIEW_SORT_COLUMNS } from '@/config/reviews';
import type { RwId } from '@/config/rw';
import { DB_ENUMS } from '@/db/enums';
import type { Tables } from '@/db/types';
import { reviewsCopy } from '@/lib/copy/reviews';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { allowedValue } from '@/lib/utils/content-list';
import { toJakartaIsoString } from '@/lib/utils/dates';
import {
  allowedValues,
  pageRange,
  parseSort,
  searchPattern,
  type ListQuery,
} from '@/lib/utils/list-query';
import type { ModerateReviewValues } from '@/lib/validations/review';
import type { ListResult } from '@/types/data-table';
import type { ReviewAdmin } from '@/types/review';

// /dashboard/reviews (Task P4.3.07, docs/PRD.md FR-ADMIN-19) through the session client, so 0005 decides:
// reviews_staff_read shows a staff member the reviews of the RWs they own (a combo's to both RW admins), and
// reviews_super_moderate lets only the superadmin write the three granted columns. The author is read as
// public_reviewer_name only; reviewer_name is granted to no API role (review of 0005).

const COLUMNS =
  'id, rating, title, body, public_reviewer_name, institution_name, rw_ids, status, is_featured, moderation_note, moderated_at, created_at';
const RATING_OPTIONS = RATING_VALUES.map(String);

type ReviewRow = Pick<
  Tables<'reviews'>,
  | 'id'
  | 'rating'
  | 'title'
  | 'body'
  | 'public_reviewer_name'
  | 'institution_name'
  | 'rw_ids'
  | 'status'
  | 'is_featured'
  | 'moderation_note'
  | 'moderated_at'
  | 'created_at'
>;

function toReviewAdmin(row: ReviewRow): ReviewAdmin {
  return {
    id: row.id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    // A stored generated column, never NULL while reviewer_name is NOT NULL; PostgREST types it nullable.
    publicReviewerName: row.public_reviewer_name ?? reviewsCopy.moderation.anonymousName,
    institutionName: row.institution_name,
    rwIds: row.rw_ids,
    status: row.status,
    isFeatured: row.is_featured,
    moderationNote: row.moderation_note,
    moderatedAt: row.moderated_at === null ? null : toJakartaIsoString(row.moderated_at),
    createdAt: toJakartaIsoString(row.created_at),
  };
}

// One page of reviews from the URL's query: `?q=` searches the body, `?status=` the review_status values, `?category=`
// one rating, `?rw=` (already settled by effectiveRw) the reviews that visited that RW.
export async function listReviewsForStaff(
  query: ListQuery,
  rw: RwId | null,
): Promise<ListResult<ReviewAdmin>> {
  const { from, to } = pageRange(query.page, query.per);
  const order =
    parseSort(query.sort, REVIEW_SORT_COLUMNS) ??
    parseSort(REVIEW_DEFAULT_SORT, REVIEW_SORT_COLUMNS);
  const pattern = searchPattern(query.q);
  const statuses = allowedValues(query.status, DB_ENUMS.review_status);
  const rating = allowedValue(query.category, RATING_OPTIONS);
  const supabase = await createSupabaseServerClient();
  let request = supabase.from('reviews').select(COLUMNS, { count: 'exact' });
  if (rw !== null) request = request.contains('rw_ids', [rw]);
  if (pattern !== null) request = request.ilike('body', pattern);
  if (statuses.length > 0) request = request.in('status', statuses);
  if (rating !== null) request = request.eq('rating', Number(rating));
  if (order !== null) request = request.order(order.column, { ascending: order.ascending });
  const { data, error, count } = await request.order('id').range(from, to);
  if (error) throw error;
  return { rows: data.map(toReviewAdmin), total: count ?? data.length };
}

// The superadmin's decision on one review. No row back means RLS hid or refused it: the same NOT_FOUND either way.
export async function moderateReview(values: ModerateReviewValues): Promise<ReviewAdmin> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('reviews')
    .update({
      status: values.status,
      is_featured: values.isFeatured,
      moderation_note: values.moderationNote,
    })
    .eq('id', values.id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (data === null) throw new AppError('NOT_FOUND');
  return toReviewAdmin(data);
}
