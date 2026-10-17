import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §5.4: one size, static (never a button), semantic variants use the soft pair.
const badgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        success: 'bg-success-soft text-success-soft-foreground',
        warning: 'bg-warning-soft text-warning-soft-foreground',
        info: 'bg-info-soft text-info-soft-foreground',
        danger: 'bg-danger-soft text-danger-soft-foreground',
        neutral: 'bg-neutral-soft text-neutral-soft-foreground',
      },
      // Terminal or historic states (completed, expired, refunded): same text colour, border, no fill.
      appearance: {
        solid: '',
        outline: 'border-current bg-transparent',
      },
      dot: {
        true: 'before:size-1.5 before:rounded-full before:bg-current',
        false: '',
      },
    },
    defaultVariants: { variant: 'default', appearance: 'solid', dot: false },
  },
);

export interface BadgeProps
  extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, appearance, dot, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, appearance, dot }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
