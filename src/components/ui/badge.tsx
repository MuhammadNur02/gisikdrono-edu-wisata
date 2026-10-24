import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §5.4 (DESIGN-SPEC §2.3): a 28 px pill, 13/600, static (never a button). Statuses use the tint
// with their strong colour and a 7 px dot, so a state never rests on colour alone. `rw` reads the RW of the
// subtree (rw-scope-* on the badge or an ancestor; RwTag sets it), `onPhoto` sits on a photo with the RW highlight
// as its dot. `sm` is the dense 22 px form for tables and tight rows.
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center rounded-full border border-transparent font-semibold whitespace-nowrap [&>svg]:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border-border-strong text-foreground',
        tag: 'bg-muted text-ink-2',
        success: 'bg-success-soft text-success-soft-foreground',
        warning: 'bg-warning-soft text-warning-soft-foreground',
        info: 'bg-info-soft text-info-soft-foreground',
        danger: 'bg-danger-soft text-danger-soft-foreground',
        neutral: 'bg-neutral-soft text-neutral-soft-foreground',
        rw: 'bg-rw-soft text-rw',
        // On a product photo the RW badge stands on the surface instead of the tint.
        rwSurface: 'bg-card text-rw',
        onPhoto: 'bg-night/60 text-white backdrop-blur-sm before:bg-rw-hi',
      },
      size: {
        default: 'h-7 gap-2 px-3 text-caption font-semibold [&>svg]:size-3.5',
        sm: 'h-5.5 gap-1.5 px-2.5 text-xs [&>svg]:size-3',
      },
      // Terminal or historic states (completed, expired, refunded): same text colour, border, no fill.
      appearance: {
        solid: '',
        outline: 'border-current bg-transparent',
      },
      dot: {
        true: 'before:size-1.75 before:shrink-0 before:rounded-full',
        false: '',
      },
    },
    compoundVariants: [
      { dot: true, variant: ['rw', 'rwSurface'], className: 'before:bg-rw-fill' },
      {
        dot: true,
        variant: [
          'default',
          'secondary',
          'outline',
          'tag',
          'success',
          'warning',
          'info',
          'danger',
          'neutral',
        ],
        className: 'before:bg-current',
      },
    ],
    defaultVariants: { variant: 'default', size: 'default', appearance: 'solid', dot: false },
  },
);

export interface BadgeProps
  extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, appearance, dot, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, size, appearance, dot }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
