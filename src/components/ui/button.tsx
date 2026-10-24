import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { uiCopy } from '@/lib/copy/ui';
import { cn } from '@/lib/utils/cn';

// A filled button rises 1 px while pointed at (DESIGN-SPEC §2.1); outline and ghost only change their fill.
const LIFT = 'motion-safe:hover:not-disabled:-translate-y-px';

// docs/StyleGuide.md §5.1 (DESIGN-SPEC §2.1): radius 10, label 600, a trailing ArrowRight marked data-icon="trailing"
// nudges forward on hover, a press scales to .98, the focus ring is the global 2 px one. Disabled: 40 % and
// not-allowed, with no hover.
const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2.5 rounded-md font-semibold whitespace-nowrap select-none press-scale nudge-trailing-icon disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5",
  {
    variants: {
      variant: {
        default: cn(
          'bg-primary text-primary-foreground hover:not-disabled:bg-primary-hover active:not-disabled:bg-primary-pressed',
          LIFT,
        ),
        secondary: cn(
          'bg-secondary text-secondary-foreground hover:not-disabled:bg-secondary-hover active:not-disabled:bg-secondary-pressed',
          LIFT,
        ),
        outline:
          'border-control border-foreground bg-transparent text-foreground hover:not-disabled:bg-muted active:not-disabled:bg-border',
        ghost: 'text-foreground hover:not-disabled:bg-muted active:not-disabled:bg-border',
        link: 'text-primary-ink underline-offset-4 hover:underline',
        destructive: cn(
          'bg-destructive text-destructive-foreground hover:not-disabled:bg-destructive/90',
          LIFT,
        ),
        success: cn('bg-success text-success-foreground hover:not-disabled:bg-success/90', LIFT),
        whatsapp: cn(
          'bg-whatsapp text-whatsapp-foreground hover:not-disabled:bg-whatsapp-hover',
          LIFT,
        ),
        // On a photo or a dark band: a glassy white edge (DESIGN-SPEC §2.1 onPhoto).
        onPhoto:
          'border-control border-white/70 bg-white/8 text-white backdrop-blur-md hover:not-disabled:bg-white/16 active:not-disabled:bg-white/24',
      },
      size: {
        sm: "h-9 px-3.5 text-label-sm max-md:min-h-11 [&_svg:not([class*='size-'])]:size-4",
        default: 'h-11 px-5 text-label',
        lg: 'h-13 px-6.5 text-label-lg',
        xl: "h-15 px-8 text-label-xl [&_svg:not([class*='size-'])]:size-5",
        icon: 'size-11',
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
      <span className="sr-only">{uiCopy.loading}</span>
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
        data-variant={variant}
        data-size={size}
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
