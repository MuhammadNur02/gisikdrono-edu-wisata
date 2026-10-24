'use client';

import * as React from 'react';

import { fieldBaseClassName } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';

function initialLength(
  value: React.ComponentProps<'textarea'>['value'],
  fallback: unknown,
): number {
  if (typeof value === 'string') return value.length;
  return typeof fallback === 'string' ? fallback.length : 0;
}

// docs/StyleGuide.md §5.6: grows with its content up to six rows, and counts characters when maxLength is set.
function Textarea({
  className,
  maxLength,
  value,
  defaultValue,
  onChange,
  ...props
}: React.ComponentProps<'textarea'>) {
  const [length, setLength] = React.useState(() => initialLength(value, defaultValue));
  const shownLength = typeof value === 'string' ? value.length : length;

  return (
    <div className="flex flex-col gap-1">
      <textarea
        data-slot="textarea"
        className={cn(fieldBaseClassName, 'field-sizing-content max-h-60 min-h-28 py-3', className)}
        maxLength={maxLength}
        value={value}
        defaultValue={defaultValue}
        onChange={(event) => {
          setLength(event.target.value.length);
          onChange?.(event);
        }}
        {...props}
      />
      {maxLength !== undefined && (
        <span className="self-end text-caption text-muted-foreground tabular-nums">
          {shownLength}/{maxLength}
        </span>
      )}
    </div>
  );
}

export { Textarea };
