import { Suspense } from 'react';

import {
  CatalogueBrowser,
  CatalogueBrowserStatic,
  type CatalogueBrowserProps,
} from '@/components/marketing/catalogue-browser';
import { ReviewCard } from '@/components/reviews/review-card';
import { reviewsListCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { reviewFacets } from '@/lib/utils/catalogue-filters';
import type { PublicReview } from '@/types/review';

const REVIEW_GRID = {
  listClassName: 'grid gap-6 md:grid-cols-2 lg:grid-cols-3',
  itemClassName: 'flex',
};
const RATING_VALUES = ['5', '4', '3', '2', '1'];

export interface ReviewListProps {
  reviews: readonly PublicReview[];
}

// docs/PRD.md FR-PUB-17: filter by star rating, `?rating=5`, in the catalogue's filter bar (DESIGN-SPEC §3.6 pattern).
// Every review is rendered here on the server; until the island loads, and without script, all show.
export function ReviewList({ reviews }: ReviewListProps) {
  const props: CatalogueBrowserProps = {
    entries: reviews.map((review) => ({
      key: review.id,
      facets: reviewFacets(review),
      card: <ReviewCard review={review} variant="card" />,
    })),
    groups: [
      {
        param: 'rating',
        label: text.filterRating,
        allLabel: copy.catalogue.filterAll,
        options: RATING_VALUES.filter((value) =>
          reviews.some((review) => String(review.rating) === value),
        ).map((value) => ({ value, label: copy.catalogue.stars(Number(value)) })),
      },
    ],
    layout: 'inline',
    noun: text.noun,
    empty: {
      icon: 'review',
      title: text.emptyFilteredTitle,
      description: text.emptyFilteredBody,
      askLabel: text.askLabel,
      askMessage: copy.layout.whatsAppGreeting(text.whatsAppTopic),
    },
    ...REVIEW_GRID,
  };
  return (
    <Suspense fallback={<CatalogueBrowserStatic {...props} />}>
      <CatalogueBrowser {...props} />
    </Suspense>
  );
}
