import type { EnumValue } from '@/db/enums';
import type { RwBadge } from '@/types/rw-unit';

// A published review as v_public_reviews shows it: the reviewer's first name or `Pengunjung`, never the
// full name or the booking (docs/Security.md GUEST-05).
export interface PublicReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  reviewerName: string;
  institutionName: string | null;
  rws: RwBadge[];
  isFeatured: boolean;
  createdAt: string;
}

// The aggregate of published reviews behind the hero's trust row and AggregateRating.
export interface RatingSummary {
  averageRating: number;
  reviewCount: number;
}

// A review as a staff member reads it on /dashboard/reviews (Task P4.3.07): the columns 0005 grants authenticated,
// so the author shows as public_reviewer_name; reviewer_name is granted to no API role, the superadmin included.
export interface ReviewAdmin {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  publicReviewerName: string;
  institutionName: string | null;
  rwIds: number[];
  status: EnumValue<'review_status'>;
  isFeatured: boolean;
  moderationNote: string | null;
  moderatedAt: string | null;
  createdAt: string;
}
