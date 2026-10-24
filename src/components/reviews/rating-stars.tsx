import { Star } from 'lucide-react';

import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatRating } from '@/lib/utils/ratings';

// reviews.rating is a 1–5 score (0003_tables.sql).
const MAX_RATING = 5;
const STAR_POSITIONS = Array.from({ length: MAX_RATING }, (_, index) => index + 1);

export interface RatingStarsProps {
  rating: number;
  className?: string;
}

// docs/StyleGuide.md §5.10 (DESIGN-SPEC §2.5): 18 px filled stars in gold, an unearned one in line-strong; the label carries the number, the stars are
// decoration. A star counts as filled from half a point up.
export function RatingStars({ rating, className }: RatingStarsProps) {
  return (
    <span
      role="img"
      aria-label={copy.catalogue.rating(formatRating(rating), MAX_RATING)}
      className={cn('inline-flex items-center gap-0.75', className)}
    >
      {STAR_POSITIONS.map((position) => (
        <Star
          key={position}
          aria-hidden
          className={cn(
            'size-4.5',
            position <= Math.round(rating)
              ? 'fill-gold text-gold'
              : 'fill-border-strong text-border-strong',
          )}
        />
      ))}
    </span>
  );
}
