'use client';

import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { chipClassName } from '@/components/marketing/filter-chip-class';
import { rwAccentClasses, type RwAccent } from '@/config/rw';
import { catalogueUiCopy } from '@/lib/copy/catalogue-ui';
import type { BrowseGroup } from '@/lib/utils/catalogue-browse';
import type { CatalogueFilters } from '@/lib/utils/catalogue-filters';
import { cn } from '@/lib/utils/cn';

export interface BrowseChipProps {
  isPressed: boolean;
  // A chosen filter in an empty result leads with an X: pressing it removes the filter (DESIGN-SPEC §3.14).
  isRemovable?: boolean;
  accentKey?: RwAccent | undefined;
  // The combination option's dot, in the primary set (DESIGN-SPEC §1.1).
  isCombo?: boolean | undefined;
  label: string;
  onClick: () => void;
}

function ChipIcon({
  isPressed,
  isRemovable,
  accentKey,
  isCombo,
}: Omit<BrowseChipProps, 'label' | 'onClick'>) {
  if (isPressed && isRemovable) return <X aria-hidden className="size-4" />;
  if (isPressed) {
    return (
      <Check
        aria-hidden
        className="size-4 motion-safe:animate-in motion-safe:duration-200 motion-safe:ease-spring-snappy motion-safe:zoom-in-0"
      />
    );
  }
  if (!accentKey && !isCombo) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'size-2.5 rounded-full bg-rw-fill',
        accentKey ? rwAccentClasses(accentKey).scope : 'rw-scope-combo',
      )}
    />
  );
}

// Chip/Filter of DESIGN-SPEC §2.3 as a toggle button: the chosen one is pressed (inverse fill and a check), an RW option
// leads with its dot.
export function BrowseChip({
  isPressed,
  isRemovable,
  accentKey,
  isCombo,
  label,
  onClick,
}: BrowseChipProps) {
  return (
    <button
      type="button"
      aria-pressed={isPressed}
      aria-label={isPressed && isRemovable ? catalogueUiCopy.removeFilter(label) : undefined}
      onClick={onClick}
      className={cn(chipClassName(isPressed), 'shrink-0')}
    >
      <ChipIcon
        isPressed={isPressed}
        isRemovable={isRemovable}
        accentKey={accentKey}
        isCombo={isCombo}
      />
      {label}
    </button>
  );
}

export interface GroupChipsProps {
  group: BrowseGroup;
  filters: CatalogueFilters;
  isEmpty: boolean;
  onChange: (param: string, value: string | null) => void;
  // The group's own `Semua …` chip leads the row; the inline bar has one `Semua` for every group instead.
  hasAllChip?: boolean;
}

// One group's options; pressing the chosen option again clears it.
export function GroupChips({
  group,
  filters,
  isEmpty,
  onChange,
  hasAllChip = true,
}: GroupChipsProps) {
  const value = filters[group.param] ?? null;
  return (
    <>
      {hasAllChip ? (
        <BrowseChip
          isPressed={value === null}
          label={group.allLabel}
          onClick={() => {
            onChange(group.param, null);
          }}
        />
      ) : null}
      {group.options.map((option) => (
        <BrowseChip
          key={option.value}
          isPressed={value === option.value}
          isRemovable={isEmpty}
          accentKey={option.accentKey}
          isCombo={option.isCombo}
          label={option.label}
          onClick={() => {
            onChange(group.param, value === option.value ? null : option.value);
          }}
        />
      ))}
    </>
  );
}

// A row of chips that scrolls sideways inside itself on a phone instead of widening the page (§5, 360 px).
// `both` runs it to the screen's edges past the 20 px gutters; `end` only to the right edge, beside a button.
export function ChipScroller({
  label,
  bleed = 'both',
  children,
}: {
  label: string;
  bleed?: 'both' | 'end';
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'scrollbar-none flex min-w-0 gap-2 overflow-x-auto md:mx-0 md:flex-wrap md:overflow-visible md:px-0',
        bleed === 'both' ? '-mx-5 px-5' : '-mr-5 pr-5',
      )}
    >
      {children}
    </div>
  );
}
