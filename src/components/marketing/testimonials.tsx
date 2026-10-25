import { Section } from '@/components/layout/section';
import { SnapRail } from '@/components/marketing/snap-rail';
import { ReviewCard } from '@/components/reviews/review-card';
import { homeCopy } from '@/lib/copy/home';
import type { PublicReview } from '@/types/review';

export interface TestimonialsProps {
  id: string;
  reviews: readonly PublicReview[];
}

// DESIGN-SPEC §3.1 `Ulasan` and §4: the featured reviews in a scroll-snap slider that starts in line with the content
// and runs on past the right edge, the next card cut off by the screen. The visitor moves it (swipe, keys, or the
// two buttons), never a timer (WCAG 2.2.2); the bars under it mark the first card in view.
export function Testimonials({ id, reviews }: TestimonialsProps) {
  const rowId = `${id}-baris`;
  return (
    <Section
      id={id}
      tone="muted"
      eyebrow={homeCopy.reviews.eyebrow}
      title={homeCopy.reviews.title}
      description={homeCopy.reviews.description}
      headerAction={
        <SnapRail targetId={rowId} count={reviews.length} buttonsClassName="max-md:hidden" />
      }
      bleed={
        <div className="space-y-10">
          <ul
            id={rowId}
            tabIndex={0}
            aria-label={homeCopy.reviews.rowLabel}
            className="scrollbar-none flex snap-x snap-mandatory pl-container gap-4 overflow-x-auto scroll-smooth pr-container pb-1 motion-reduce:scroll-auto md:gap-6"
          >
            {reviews.map((review) => (
              <li key={review.id} className="w-75 shrink-0 snap-start md:w-96">
                <ReviewCard review={review} />
              </li>
            ))}
          </ul>
          <SnapRail targetId={rowId} count={reviews.length} barsClassName="pl-container" />
        </div>
      }
    />
  );
}
