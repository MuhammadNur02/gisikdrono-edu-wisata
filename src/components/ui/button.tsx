import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §5.1: variants, sizes and the 16 px icon (20 px at lg and xl).
const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-border bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary-text underline-offset-4 hover:underline',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        success: 'bg-success text-success-foreground hover:bg-success/90',
      },
      size: {
        sm: 'h-9 px-3 text-sm max-md:min-h-11',
        default: 'h-10 px-4 text-sm max-md:min-h-11',
        lg: "h-12 px-6 text-base [&_svg:not([class*='size-'])]:size-5",
        xl: "h-14 px-8 text-base font-semibold [&_svg:not([class*='size-'])]:size-5",
        icon: 'size-10 max-md:size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  // Shows a spinner in place of the label without changing the button's width, and blocks clicks.
  loading?: boolean;
}

function LoadingSpinner() {
  return (
    <span className="absolute inset-0 flex items-center justify-center">
      <Loader2 aria-hidden className="motion-safe:animate-spin" />
      <span className="sr-only">{copy.ui.loading}</span>
    </span>
  );
}

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {/* display: contents keeps the label in the button's own flex row; invisible still inherits. */}
      <span data-slot="button-label" className={cn('contents', loading && 'invisible')}>
        {children}
      </span>
      {loading && <LoadingSpinner />}
    </button>
  );
}

export { Button, buttonVariants };
