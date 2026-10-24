import { Quote } from 'lucide-react';

import { Section } from '@/components/layout/section';
import { SectionLink } from '@/components/marketing/section-link';
import { ReviewCard } from '@/components/reviews/review-card';
import { cn } from '@/lib/utils/cn';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import type { PublicReview } from '@/types/review';

export interface TestimonialsProps {
  id: string;
  reviews: readonly PublicReview[];
}

// From lg the first review is the large one and the others stack beside it (decision of 2026-10-23, §1.3 G7);
// below lg they share one column. Nothing rotates or scrolls by itself (WCAG 2.2.2).
const LEAD_ITEM = 'lg:col-span-7 lg:row-span-2';
const SIDE_ITEM = 'lg:col-span-5';

// The lead review's quote mark sits in the top-right corner beside the stars. At 32 px from 16 px down it ends
// above the quote's first line (the card's padding, the 16 px stars row and their 16 px gap), so it never
// overlaps the text (review of PR #36).
function ReviewItem({ review, isLead }: { review: PublicReview; isLead: boolean }) {
  return (
    <div className="relative h-full">
      {isLead ? (
        <Quote
          aria-hidden
          className="absolute top-4 right-4 size-8 text-muted-foreground/40"
          strokeWidth={1.5}
        />
      ) : null}
      <ReviewCard review={review} />
    </div>
  );
}

// docs/PRD.md FR-PUB-05. The page leaves this section out while no review is published and featured: the
// site never shows a sample review (§1.3 G5).
export function Testimonials({ id, reviews }: TestimonialsProps) {
  return (
    <Section
      id={id}
      tone="muted"
      wave={{ variant: 'gentle' }}
      eyebrow="Ulasan pengunjung"
      title="Kata rombongan yang sudah berkunjung"
      headerAction={<SectionLink href={PUBLIC_PATHS.reviews} label="Lihat semua ulasan" />}
    >
      <ul className="grid gap-6 lg:grid-cols-12">
        {reviews.map((review, index) => (
          <li key={review.id} className={cn('reveal', index === 0 ? LEAD_ITEM : SIDE_ITEM)}>
            <ReviewItem review={review} isLead={index === 0} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
