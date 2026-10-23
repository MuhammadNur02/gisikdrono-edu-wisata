import { Suspense } from 'react';

import { CatalogueList, type CatalogueEntry } from '@/components/marketing/catalogue-list';
import {
  FilteredCatalogue,
  type CatalogueFilterGroup,
} from '@/components/marketing/filtered-catalogue';
import { ReviewCard } from '@/components/reviews/review-card';
import { copy } from '@/lib/copy/id';
import { reviewFacets } from '@/lib/utils/catalogue-filters';
import type { PublicReview } from '@/types/review';

const LIST_CLASS_NAME = 'grid gap-6 md:grid-cols-2 lg:grid-cols-3';
const RATING_VALUES = ['5', '4', '3', '2', '1'];

// docs/PRD.md FR-PUB-17: filter by star rating, `?rating=5`.
const RATING_GROUP: CatalogueFilterGroup = {
  param: 'rating',
  label: copy.catalogue.filterRating,
  options: RATING_VALUES.map((value) => ({ value, label: copy.catalogue.stars(Number(value)) })),
};

export interface ReviewListProps {
  reviews: readonly PublicReview[];
}

// Every review is rendered here on the server; until the filter island loads, and without script, all show.
export function ReviewList({ reviews }: ReviewListProps) {
  const entries: CatalogueEntry[] = reviews.map((review) => ({
    key: review.id,
    facets: reviewFacets(review),
    card: <ReviewCard review={review} variant="card" />,
  }));
  return (
    <Suspense fallback={<CatalogueList entries={entries} listClassName={LIST_CLASS_NAME} />}>
      <FilteredCatalogue
        groups={[RATING_GROUP]}
        entries={entries}
        emptyMessage={copy.catalogue.reviewsFilterEmpty}
        listClassName={LIST_CLASS_NAME}
      />
    </Suspense>
  );
}
