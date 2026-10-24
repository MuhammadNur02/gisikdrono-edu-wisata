import * as React from 'react';

import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §5.6 (DESIGN-SPEC §2.4): the surface fill, a 1 px border-input edge (3.6:1 on paper), radius 10,
// 16 px text so iOS Safari never zooms in. Focus turns the edge into the 2 px ring colour in place of the outer ring;
// an error is a 1.5 px danger edge (aria-invalid), a verified value a 1.5 px success edge (data-verified). Only the
// colours change, over 120 ms: fields never animate otherwise (§7.3).
export const fieldBaseClassName =
  'w-full min-w-0 rounded-md border border-input bg-card px-3.5 text-base text-foreground transition-colors duration-120 ease-out-soft outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-control aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive data-[verified=true]:border-control data-[verified=true]:border-success';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldBaseClassName,
        'h-12 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
