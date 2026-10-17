import type * as React from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';

export interface InputWithPrefixProps extends React.ComponentProps<'input'> {
  prefix: string;
}

// A fixed chip glued to the left of an input ('+62', 'Rp', '/paket-wisata/'). The chip turns red with
// the input, so an error never reads as half a field.
export function InputWithPrefix({ prefix, className, ...props }: InputWithPrefixProps) {
  return (
    <div className="group flex w-full">
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center rounded-l-xl border border-r-0 border-input bg-muted px-3 text-body-sm text-muted-foreground group-has-[[aria-invalid=true]]:border-destructive"
      >
        {prefix}
      </span>
      <Input className={cn('rounded-l-none', className)} {...props} />
    </div>
  );
}
