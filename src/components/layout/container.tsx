import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §4.1: the public site never grows past 1280 px; reading pages keep a narrow column.
const containerVariants = cva('mx-auto w-full px-4 sm:px-6 lg:px-8', {
  variants: {
    width: {
      page: 'max-w-7xl',
      reading: 'max-w-3xl',
    },
  },
  defaultVariants: { width: 'page' },
});

export interface ContainerProps
  extends ComponentProps<'div'>, VariantProps<typeof containerVariants> {}

export function Container({ className, width, ...props }: ContainerProps) {
  return <div className={cn(containerVariants({ width }), className)} {...props} />;
}
