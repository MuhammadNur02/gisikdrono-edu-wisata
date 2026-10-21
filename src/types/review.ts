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
