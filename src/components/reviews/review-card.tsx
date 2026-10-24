import { RwTag } from '@/components/layout/rw-tag';
import { RatingStars } from '@/components/reviews/rating-stars';
import { rwAccentClasses } from '@/config/rw';
import { cn } from '@/lib/utils/cn';
import { formatDateShort } from '@/lib/utils/dates';
import type { PublicReview } from '@/types/review';

export interface ReviewCardProps {
  review: PublicReview;
  // `quote` on the home band (clamped to six lines), `card` in the /ulasan grid (the whole review, with its RWs).
  variant?: 'quote' | 'card';
}

// The avatar wears the first RW the review is about (rw-scope-*), or the primary when it names none.
function avatarScope(review: PublicReview): string {
  const [firstRw] = review.rws;
  return firstRw ? rwAccentClasses(firstRw.accentKey).scope : 'rw-scope-combo';
}

// The person under a hairline: the avatar in the RW's accent with the initial, the first name, the institution and date.
function Byline({ review }: Pick<ReviewCardProps, 'review'>) {
  return (
    <figcaption className="mt-auto flex items-center gap-3 border-t border-border pt-4">
      <span
        aria-hidden
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full bg-rw-fill font-display text-base font-bold text-on-accent',
          avatarScope(review),
        )}
      >
        {review.reviewerName.charAt(0).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body-md font-semibold">{review.reviewerName}</span>
        <span className="text-caption text-muted-foreground">
          {review.institutionName ? `${review.institutionName} · ` : null}
          <time dateTime={review.createdAt}>{formatDateShort(review.createdAt)}</time>
        </span>
      </span>
    </figcaption>
  );
}

// Card/Review of DESIGN-SPEC §2.5 (docs/StyleGuide.md §5.10), the one content card on a surface: stars, the quote, and
// the person under a hairline. It shows only what v_public_reviews gives the public: the first name or `Pengunjung`
// and the institution (FR-PUB-05), never the booking.
export function ReviewCard({ review, variant = 'quote' }: ReviewCardProps) {
  return (
    <figure className="flex h-full flex-col gap-5 rounded-xl border border-border bg-card p-6 md:p-8">
      <RatingStars rating={review.rating} />
      <blockquote
        className={cn(
          'text-quote text-foreground',
          variant === 'quote' ? 'line-clamp-6' : 'space-y-1',
        )}
      >
        {review.title ? <p className="font-semibold">{review.title}</p> : null}
        <p>{review.body}</p>
      </blockquote>
      <Byline review={review} />
      {variant === 'card' && review.rws.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {review.rws.map((rw) => (
            <RwTag key={rw.id} rw={rw} size="sm" />
          ))}
        </div>
      ) : null}
    </figure>
  );
}
