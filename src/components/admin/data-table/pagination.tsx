'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LIST_PAGE_SIZES } from '@/config/dashboard';
import type { ListQueryPatch } from '@/hooks/use-list-query';
import { copy } from '@/lib/copy/id';
import { pageCountOf } from '@/lib/utils/list-query';

const text = copy.dashboard.table;
const FIRST_PAGE = 1;

type PageSize = (typeof LIST_PAGE_SIZES)[number];

export interface PaginationProps {
  page: number;
  per: number;
  total: number;
  update: (patch: ListQueryPatch) => void;
}

function pageSizeOf(value: string): PageSize | null {
  return LIST_PAGE_SIZES.find((size) => String(size) === value) ?? null;
}

function PageSizeSelect({ per, update }: Pick<PaginationProps, 'per' | 'update'>) {
  return (
    <label className="flex items-center gap-2 text-body-sm text-muted-foreground">
      <span className="sr-only sm:not-sr-only">{text.perPage}</span>
      <Select
        value={String(per)}
        onValueChange={(value) => {
          const size = pageSizeOf(value);
          if (size !== null) update({ per: size });
        }}
      >
        <SelectTrigger size="sm" aria-label={text.perPage} className="w-20 tabular-nums">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LIST_PAGE_SIZES.map((size) => (
            <SelectItem key={size} value={String(size)} className="tabular-nums">
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

interface PageButtonProps {
  label: string;
  disabled: boolean;
  onClick: () => void;
  // First and last are offered from lg up (docs/StyleGuide.md §6.4).
  wide?: boolean;
  children: ReactNode;
}

function PageButton({ label, disabled, onClick, wide = false, children }: PageButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={wide ? 'hidden lg:inline-flex' : undefined}
    >
      {children}
    </Button>
  );
}

interface PageControlsProps {
  current: number;
  pageCount: number;
  goTo: (page: number) => void;
}

// First and last (wide, from lg), previous and next, each with where it goes and when it is greyed out.
function pageButtonsOf({ current, pageCount }: Omit<PageControlsProps, 'goTo'>) {
  const atFirst = current <= FIRST_PAGE;
  const atLast = current >= pageCount;
  return [
    {
      label: text.firstPage,
      disabled: atFirst,
      target: FIRST_PAGE,
      wide: true,
      Icon: ChevronsLeft,
    },
    {
      label: text.previousPage,
      disabled: atFirst,
      target: current - 1,
      wide: false,
      Icon: ChevronLeft,
    },
    {
      label: text.nextPage,
      disabled: atLast,
      target: current + 1,
      wide: false,
      Icon: ChevronRight,
    },
    { label: text.lastPage, disabled: atLast, target: pageCount, wide: true, Icon: ChevronsRight },
  ];
}

function PageControls({ current, pageCount, goTo }: PageControlsProps) {
  const buttons = pageButtonsOf({ current, pageCount });
  return (
    <div className="flex items-center gap-1">
      {buttons.map(({ label, disabled, target, wide, Icon }) => (
        <PageButton
          key={label}
          wide={wide}
          label={label}
          disabled={disabled}
          onClick={() => {
            goTo(target);
          }}
        >
          <Icon aria-hidden />
        </PageButton>
      ))}
    </div>
  );
}

// docs/StyleGuide.md §6.4: `Menampilkan 1–25 dari 312`, the page size, previous and next, first and last from lg.
export function Pagination({ page, per, total, update }: PaginationProps) {
  const pageCount = pageCountOf(total, per);
  const current = Math.min(Math.max(page, FIRST_PAGE), pageCount);
  const from = total === 0 ? 0 : (current - 1) * per + 1;
  const to = Math.min(current * per, total);
  const goTo = (next: number) => {
    update({ page: next === FIRST_PAGE ? null : next });
  };
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body-sm text-muted-foreground tabular-nums" aria-live="polite">
        {text.showing(from, to, total)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <PageSizeSelect per={per} update={update} />
        <span className="text-body-sm text-muted-foreground tabular-nums">
          {text.page(current, pageCount)}
        </span>
        <PageControls current={current} pageCount={pageCount} goTo={goTo} />
      </div>
    </div>
  );
}
