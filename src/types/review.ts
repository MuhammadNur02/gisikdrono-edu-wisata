import type { RwId } from '@/config/rw';

// A published review as v_public_reviews shows it: the reviewer's first name or `Pengunjung`, never the
// full name or the booking (docs/Security.md GUEST-05).
export interface PublicReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  reviewerName: string;
  institutionName: string | null;
  rwIds: RwId[];
  isFeatured: boolean;
  createdAt: string;
}
