import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §4.1 (DESIGN-SPEC §1.4): 20 px gutters on phones, 40 px from md, a 1200 px content column at the
// widest (1280 with its gutters); reading pages keep a narrow column.
const containerVariants = cva('mx-auto w-full px-5 md:px-10', {
  variants: {
    width: {
      page: 'max-w-7xl',
      reading: 'max-w-200',
    },
  },
  defaultVariants: { width: 'page' },
});

export interface ContainerProps
  extends ComponentProps<'div'>, VariantProps<typeof containerVariants> {}

export function Container({ className, width, ...props }: ContainerProps) {
  return <div className={cn(containerVariants({ width }), className)} {...props} />;
}
