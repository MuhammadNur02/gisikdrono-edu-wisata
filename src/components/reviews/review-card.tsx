import { RwTag } from '@/components/layout/rw-tag';
import { RatingStars } from '@/components/reviews/rating-stars';
import { formatDateShort } from '@/lib/utils/dates';
import type { PublicReview } from '@/types/review';

export interface ReviewCardProps {
  review: PublicReview;
}

// The home page's `quote` variant of docs/StyleGuide.md §5.10. It shows only what v_public_reviews gives the
// public: the first name or `Pengunjung`, the institution, never the booking. The `card` variant for
// /ulasan arrives with Task P2.4.10.
export function ReviewCard({ review }: ReviewCardProps) {
  return (
    <figure className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-5 md:p-6 dark:border-white/5">
      <RatingStars rating={review.rating} />
      <blockquote className="line-clamp-6 text-body-lg">
        {review.title ? <p className="font-medium">{review.title}</p> : null}
        <p>{review.body}</p>
      </blockquote>
      <figcaption className="mt-auto flex flex-wrap items-center gap-2 text-body-sm">
        <span
          aria-hidden
          className="flex size-8 items-center justify-center rounded-full bg-secondary font-medium text-secondary-foreground"
        >
          {review.reviewerName.charAt(0).toUpperCase()}
        </span>
        <span className="font-medium">{review.reviewerName}</span>
        {review.institutionName ? (
          <span className="text-muted-foreground">· {review.institutionName}</span>
        ) : null}
        <time dateTime={review.createdAt} className="text-muted-foreground">
          · {formatDateShort(review.createdAt)}
        </time>
        {review.rwIds.map((rwId) => (
          <RwTag key={rwId} rwId={rwId} />
        ))}
      </figcaption>
    </figure>
  );
}
