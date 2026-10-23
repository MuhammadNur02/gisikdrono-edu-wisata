import type { Metadata } from 'next';

import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { RatingStars } from '@/components/reviews/rating-stars';
import { ReviewList } from '@/components/reviews/review-list';
import { JsonLd } from '@/components/seo/json-ld';
import { copy } from '@/lib/copy/id';
import { listPublicReviews } from '@/lib/queries/reviews';
import { aggregateRatingJsonLd, reviewJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import { formatRating, summarizeRatings } from '@/lib/utils/ratings';
import type { PublicReview, RatingSummary } from '@/types/review';

export const revalidate = 3600;

const TITLE = 'Ulasan pengunjung';
const DESCRIPTION =
  'Ulasan dari rombongan yang sudah berkunjung ke kampung-kampung edukasi Gisikdrono.';

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PUBLIC_PATHS.reviews,
});

function RatingSummaryLine({ summary }: { summary: RatingSummary }) {
  return (
    <p className="flex flex-wrap items-center gap-3 text-body-lg">
      <span className="text-h2 tabular-nums">{formatRating(summary.averageRating)}</span>
      <RatingStars rating={summary.averageRating} />
      <span className="text-muted-foreground">
        {copy.catalogue.reviewCount(summary.reviewCount)}
      </span>
    </p>
  );
}

function reviewsJsonLd(reviews: readonly PublicReview[], summary: RatingSummary) {
  return [
    aggregateRatingJsonLd(summary),
    ...reviews.map((review) =>
      reviewJsonLd({
        rating: review.rating,
        body: review.body,
        authorName: review.reviewerName,
        datePublished: review.createdAt,
      }),
    ),
  ];
}

// docs/PRD.md FR-PUB-17, Task P2.4.10: published reviews from v_public_reviews only, never a sample. With none
// published there is no rating to summarise, so the page is its header alone (StyleGuide §6.9).
export default async function ReviewsPage() {
  const reviews = await listPublicReviews();
  const summary = summarizeRatings(reviews);
  return (
    <>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        breadcrumbs={[]}
        path={PUBLIC_PATHS.reviews}
      >
        {summary ? <RatingSummaryLine summary={summary} /> : null}
      </PageHeader>
      {summary ? (
        <Container className="pb-16 md:pb-24">
          <ReviewList reviews={reviews} />
          <JsonLd data={reviewsJsonLd(reviews, summary)} />
        </Container>
      ) : null}
    </>
  );
}
