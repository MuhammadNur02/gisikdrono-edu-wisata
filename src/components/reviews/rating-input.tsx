'use client';

import { Star } from 'lucide-react';
import type { ComponentProps } from 'react';

import { MAX_RATING, RATING_VALUES } from '@/config/reviews';
import { reviewsCopy } from '@/lib/copy/reviews';
import { cn } from '@/lib/utils/cn';
import { fieldLabelId } from '@/lib/utils/field-ids';

export interface RatingInputProps extends Omit<ComponentProps<'div'>, 'onChange'> {
  // The radios' shared name; one group per form.
  name: string;
  // 0 while nothing is chosen yet.
  value: number;
  onChange: (rating: number) => void;
}

// docs/StyleGuide.md §5.10: the review form's RatingStars as a radio group (WCAG 2.1 AA). Native radios sharing a name
// give the arrow keys and one tab stop for free; each star is a 44 px target labelled `3 dari 5 bintang`, and the
// stars up to the chosen one are filled. FormControl hands this element the field's id, aria-describedby and
// aria-invalid; a div is no labelable element, so it points aria-labelledby at the field's label instead.
export function RatingInput({ name, value, onChange, className, id, ...props }: RatingInputProps) {
  return (
    <div
      role="radiogroup"
      id={id}
      aria-labelledby={id ? fieldLabelId(id) : undefined}
      className={cn('flex flex-wrap gap-1', className)}
      {...props}
    >
      {RATING_VALUES.map((rating) => (
        <label
          key={rating}
          className="inline-flex size-11 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-muted has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background"
        >
          <input
            type="radio"
            name={name}
            value={rating}
            checked={value === rating}
            onChange={() => {
              onChange(rating);
            }}
            className="sr-only"
          />
          <Star
            aria-hidden
            className={cn(
              'size-7',
              rating <= value ? 'fill-warning text-warning' : 'text-muted-foreground',
            )}
          />
          <span className="sr-only">{reviewsCopy.form.ratingOption(rating, MAX_RATING)}</span>
        </label>
      ))}
    </div>
  );
}
