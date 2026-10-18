import Link from 'next/link';
import type { ReactNode } from 'react';

import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';

export interface FilterOption<Value extends string> {
  value: Value;
  label: string;
}

export interface FilterChipsProps<Value extends string> {
  // Names the group for screen readers and above the chips: `Kampung`, `Jenis paket`.
  label: string;
  options: readonly FilterOption<Value>[];
  // NULL is `Semua`.
  value: Value | null;
  onChange: (value: Value | null) => void;
}

function chipClassName(isPressed: boolean): string {
  return cn(
    'inline-flex min-h-11 items-center rounded-full border px-4 text-body-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
    isPressed
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-background hover:bg-accent',
  );
}

function Chip({
  isPressed,
  onClick,
  children,
}: {
  isPressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={isPressed}
      onClick={onClick}
      className={chipClassName(isPressed)}
    >
      {children}
    </button>
  );
}

// The same pill as a link, for /galeri, whose filter is the address itself (docs/StyleGuide.md §5.11). The
// chosen one is the current page.
export function FilterChipLink({
  href,
  isCurrent,
  children,
}: {
  href: string;
  isCurrent: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={isCurrent ? 'page' : undefined}
      scroll={false}
      className={chipClassName(isCurrent)}
    >
      {children}
    </Link>
  );
}

// The pill filters of the public catalogues (docs/StyleGuide.md §5.5, §5.11): one choice per group, `Semua`
// first, 44 px targets. The chosen chip is pressed, not only coloured (§1.1 P4).
export function FilterChips<Value extends string>({
  label,
  options,
  value,
  onChange,
}: FilterChipsProps<Value>) {
  return (
    <div role="group" aria-label={label} className="space-y-2">
      <p className="text-overline text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        <Chip
          isPressed={value === null}
          onClick={() => {
            onChange(null);
          }}
        >
          {copy.catalogue.filterAll}
        </Chip>
        {options.map((option) => (
          <Chip
            key={option.value}
            isPressed={value === option.value}
            onClick={() => {
              onChange(option.value);
            }}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
