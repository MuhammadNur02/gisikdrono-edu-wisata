import { MessageSquareQuote } from 'lucide-react';
import type { Metadata } from 'next';

import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { CatalogueState } from '@/components/marketing/catalogue-state';
import { RatingStars } from '@/components/reviews/rating-stars';
import { ReviewList } from '@/components/reviews/review-list';
import { JsonLd } from '@/components/seo/json-ld';
import { reviewsPageCopy as text } from '@/lib/copy/catalogue';
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

// The rating beside the page head, in the summary box of the list pattern (DESIGN-SPEC §3.4): the average in Jakarta,
// the gold stars and how many reviews it comes from.
function RatingSummaryBox({ summary }: { summary: RatingSummary }) {
  return (
    <div className="inline-flex items-center gap-4 rounded-lg border border-border bg-card px-5 py-4">
      <span className="font-display text-4xl leading-none font-extrabold tabular-nums">
        {formatRating(summary.averageRating)}
      </span>
      <span className="space-y-1.5">
        <RatingStars rating={summary.averageRating} />
        <span className="block text-caption text-muted-foreground">
          {copy.catalogue.reviewCount(summary.reviewCount)}
        </span>
      </span>
    </div>
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
// published the page says how reviews arrive, in the empty state of the list pattern (DESIGN-SPEC §3.14).
export default async function ReviewsPage() {
  const reviews = await listPublicReviews();
  const summary = summarizeRatings(reviews);
  return (
    <>
      <PageHeader
        tone="paper"
        title={text.title}
        description={text.lead}
        breadcrumbs={[]}
        path={PUBLIC_PATHS.reviews}
        crumb={TITLE}
        aside={summary ? <RatingSummaryBox summary={summary} /> : undefined}
      />
      {summary ? (
        <>
          <ReviewList reviews={reviews} />
          <JsonLd data={reviewsJsonLd(reviews, summary)} />
        </>
      ) : (
        <Container className="border-t border-border pb-16 rw-scope-combo">
          <CatalogueState
            icon={MessageSquareQuote}
            tone="rw"
            title={text.emptyTitle}
            description={text.emptyBody}
          />
        </Container>
      )}
    </>
  );
}
