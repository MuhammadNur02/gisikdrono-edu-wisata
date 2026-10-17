import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §5.2. Dark mode trades the shadow for a faint white edge (§2.6).
const cardVariants = cva(
  'flex flex-col gap-5 rounded-xl border border-border bg-card py-5 text-card-foreground shadow-card aria-disabled:pointer-events-none aria-disabled:opacity-60 md:gap-6 md:py-6 dark:border-white/5 dark:shadow-none',
  {
    variants: {
      variant: {
        base: '',
        interactive:
          'transition duration-200 hover:shadow-card-hover motion-safe:hover:-translate-y-0.5 dark:hover:shadow-none',
        glass: 'bg-white/70 backdrop-blur-md dark:bg-slate-950/60',
        // The header's first icon becomes the 40 px tile, so call sites only pass the bare lucide icon.
        feature:
          '[&_[data-slot=card-header]>svg]:size-10 [&_[data-slot=card-header]>svg]:rounded-lg [&_[data-slot=card-header]>svg]:bg-secondary [&_[data-slot=card-header]>svg]:p-2.5 [&_[data-slot=card-header]>svg]:text-secondary-foreground',
      },
    },
    defaultVariants: { variant: 'base' },
  },
);

export interface CardProps extends React.ComponentProps<'div'>, VariantProps<typeof cardVariants> {
  // An interactive card is the link itself: <Card variant="interactive" asChild><Link … /></Card>.
  asChild?: boolean;
}

function Card({ className, variant = 'base', asChild = false, ...props }: CardProps) {
  const Comp = asChild ? Slot.Root : 'div';
  return (
    <Comp
      data-slot="card"
      data-variant={variant}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'flex flex-col items-start gap-2 px-5 md:px-6 [.border-b]:pb-5 md:[.border-b]:pb-6',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-title" className={cn('text-h4', className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-body-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-5 md:px-6', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center gap-2 px-5 md:px-6 [.border-t]:pt-5 md:[.border-t]:pt-6',
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, cardVariants };
