import { Check } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { rwAccentClasses, type RwAccent } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';

export interface FilterOption<Value extends string> {
  value: Value;
  label: string;
  // An RW option leads with a 10 px dot in the RW's accent (DESIGN-SPEC §2.3).
  accentKey?: RwAccent;
}

export interface FilterChipsProps<Value extends string> {
  // Names the group for screen readers and above the chips: `Kampung`, `Jenis paket`.
  label: string;
  options: readonly FilterOption<Value>[];
  // NULL is `Semua`.
  value: Value | null;
  onChange: (value: Value | null) => void;
}

// Chip/Filter of DESIGN-SPEC §2.3: 40 px (44 on phones), the surface with a line-strong edge, 14/500. Pointed at: the
// sunken paper and an ink-3 edge; pressed .97. Chosen: the inverse fill with a check that springs in, so the choice
// never rests on colour alone (§1.1 P4).
function chipClassName(isPressed: boolean): string {
  return cn(
    'inline-flex h-11 items-center gap-2 rounded-full border px-4 text-body-sm font-medium transition-colors duration-150 ease-out-soft press-scale md:h-10',
    isPressed
      ? 'border-secondary bg-secondary text-secondary-foreground'
      : 'border-border-strong bg-card text-foreground hover:border-muted-foreground hover:bg-muted',
  );
}

function ChipContent({
  isPressed,
  accentKey,
  children,
}: {
  isPressed: boolean;
  accentKey?: RwAccent | undefined;
  children: ReactNode;
}) {
  return (
    <>
      {isPressed ? (
        <Check
          aria-hidden
          className="size-4 motion-safe:animate-in motion-safe:duration-200 motion-safe:ease-spring-snappy motion-safe:zoom-in-0"
        />
      ) : null}
      {accentKey && !isPressed ? (
        <span
          aria-hidden
          className={cn('size-2.5 rounded-full bg-rw-fill', rwAccentClasses(accentKey).scope)}
        />
      ) : null}
      {children}
    </>
  );
}

function Chip({
  isPressed,
  accentKey,
  onClick,
  children,
}: {
  isPressed: boolean;
  accentKey?: RwAccent | undefined;
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
      <ChipContent isPressed={isPressed} accentKey={accentKey}>
        {children}
      </ChipContent>
    </button>
  );
}

// The same pill as a link, for /galeri, whose filter is the address itself (docs/StyleGuide.md §5.11). The
// chosen one is the current page.
export function FilterChipLink({
  href,
  isCurrent,
  accentKey,
  children,
}: {
  href: string;
  isCurrent: boolean;
  accentKey?: RwAccent;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={isCurrent ? 'page' : undefined}
      scroll={false}
      className={chipClassName(isCurrent)}
    >
      <ChipContent isPressed={isCurrent} accentKey={accentKey}>
        {children}
      </ChipContent>
    </Link>
  );
}

// The pill filters of the public catalogues (docs/StyleGuide.md §5.5, §5.11): one choice per group, `Semua`
// first. The chosen chip is pressed, not only coloured.
export function FilterChips<Value extends string>({
  label,
  options,
  value,
  onChange,
}: FilterChipsProps<Value>) {
  return (
    <div role="group" aria-label={label} className="space-y-2.5">
      <p className="text-caption font-semibold text-muted-foreground">{label}</p>
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
            accentKey={option.accentKey}
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
