import * as React from 'react';

import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §5.6. Below md the text stays at 16 px: iOS Safari zooms the page into any smaller field.
export const fieldBaseClassName =
  'w-full min-w-0 rounded-xl border border-input bg-background px-3 text-base transition-colors outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-body-sm';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldBaseClassName,
        'h-10 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground max-md:h-11',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
