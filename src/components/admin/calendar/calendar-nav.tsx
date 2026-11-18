import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { MONTH_PARAM, SESSIONS_PATH, WEEK_PARAM } from '@/config/sessions';
import { sessionsCopy } from '@/lib/copy/sessions';
import { cn } from '@/lib/utils/cn';
import {
  monthKeyOf,
  monthLabel,
  shiftMonth,
  shiftWeek,
  weekLabel,
  weekStartOf,
} from '@/lib/utils/sessions';
import type { SessionCalendarView } from '@/types/session';

const text = sessionsCopy;

function calendarHref(view: SessionCalendarView): string {
  const params =
    view.kind === 'month'
      ? new URLSearchParams({ [MONTH_PARAM]: view.month })
      : new URLSearchParams({ [WEEK_PARAM]: view.weekStart });
  return `${SESSIONS_PATH}?${params.toString()}`;
}

// The same place one step back or forward, and the week or month that holds today.
function stepsOf(view: SessionCalendarView, today: string) {
  if (view.kind === 'month') {
    return {
      label: monthLabel(view.month),
      current: { kind: 'month', month: monthKeyOf(today) } as const,
      previous: { kind: 'month', month: shiftMonth(view.month, -1) } as const,
      next: { kind: 'month', month: shiftMonth(view.month, 1) } as const,
      currentText: text.thisMonth,
      previousText: text.previousMonth,
      nextText: text.nextMonth,
    };
  }
  return {
    label: weekLabel(view.weekStart),
    current: { kind: 'week', weekStart: weekStartOf(today) } as const,
    previous: { kind: 'week', weekStart: shiftWeek(view.weekStart, -1) } as const,
    next: { kind: 'week', weekStart: shiftWeek(view.weekStart, 1) } as const,
    currentText: text.thisWeek,
    previousText: text.previousWeek,
    nextText: text.nextWeek,
  };
}

// Pekan / Bulan: switching keeps the place, a week opens its month and a month opens its first week.
function ViewSwitch({ view }: { view: SessionCalendarView }) {
  const week = view.kind === 'week' ? view.weekStart : weekStartOf(`${view.month}-01`);
  const month = view.kind === 'month' ? view.month : monthKeyOf(view.weekStart);
  const options = [
    { kind: 'week', href: calendarHref({ kind: 'week', weekStart: week }), label: text.views.week },
    { kind: 'month', href: calendarHref({ kind: 'month', month }), label: text.views.month },
  ] as const;
  return (
    <nav aria-label={text.views.label} className="flex rounded-md border border-border p-0.5">
      {options.map((option) => (
        <Link
          key={option.kind}
          href={option.href}
          aria-current={option.kind === view.kind ? 'page' : undefined}
          className={cn(
            'flex min-h-10 items-center rounded-sm px-3 text-caption font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:min-h-8',
            option.kind === view.kind && 'bg-muted text-foreground',
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

export function CalendarNav({ view, today }: { view: SessionCalendarView; today: string }) {
  const steps = stepsOf(view, today);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-h3 capitalize">{steps.label}</h2>
      <div className="flex flex-wrap items-center gap-1">
        <ViewSwitch view={view} />
        <Button asChild variant="outline" size="sm">
          <Link href={calendarHref(steps.current)}>{steps.currentText}</Link>
        </Button>
        <Button asChild variant="outline" size="icon" aria-label={steps.previousText}>
          <Link href={calendarHref(steps.previous)}>
            <ChevronLeft aria-hidden />
          </Link>
        </Button>
        <Button asChild variant="outline" size="icon" aria-label={steps.nextText}>
          <Link href={calendarHref(steps.next)}>
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
