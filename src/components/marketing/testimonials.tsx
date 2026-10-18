import { Section } from '@/components/layout/section';
import { ReviewCard } from '@/components/reviews/review-card';
import type { PublicReview } from '@/types/review';

export interface TestimonialsProps {
  id: string;
  reviews: readonly PublicReview[];
}

// docs/PRD.md FR-PUB-05. The page leaves this section out while no review is published and featured: the
// site never shows a sample review (§1.3 G5).
export function Testimonials({ id, reviews }: TestimonialsProps) {
  return (
    <Section
      id={id}
      eyebrow="Ulasan pengunjung"
      title="Kata rombongan yang sudah berkunjung"
      align="center"
    >
      <ul className="grid gap-6 md:grid-cols-3">
        {reviews.map((review) => (
          <li key={review.id}>
            <ReviewCard review={review} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
