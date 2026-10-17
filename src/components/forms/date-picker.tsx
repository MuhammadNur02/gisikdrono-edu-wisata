'use client';

import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import type * as React from 'react';
import type { Matcher } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MEDIA_MD_UP, useMediaQuery } from '@/hooks/use-media-query';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import {
  calendarDateToVisitDate,
  formatDateLong,
  visitDateToCalendarDate,
} from '@/lib/utils/dates';

export interface DatePickerProps extends Omit<
  React.ComponentProps<'button'>,
  'value' | 'onChange'
> {
  // Visit dates as Postgres `date` strings ('2026-10-18'), computed on the server with bookableRange().
  value: string | undefined;
  onChange: (visitDate: string) => void;
  firstDate: string;
  lastDate: string;
  // Days with no open session, and days that are at least 80 % reserved (shown with an amber dot).
  unavailableDates?: readonly string[];
  busyDates?: readonly string[];
}

type CalendarSettings = Pick<
  DatePickerProps,
  'value' | 'onChange' | 'firstDate' | 'lastDate' | 'unavailableDates' | 'busyDates'
>;

const BUSY_DOT =
  'after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-warning';

function disabledDays(
  firstDate: string,
  lastDate: string,
  unavailableDates: readonly string[],
): Matcher[] {
  return [
    { before: visitDateToCalendarDate(firstDate) },
    { after: visitDateToCalendarDate(lastDate) },
    ...unavailableDates.map(visitDateToCalendarDate),
  ];
}

function BusyLegend() {
  return (
    <p className="flex items-center gap-2 px-3 pb-2 text-caption text-muted-foreground">
      <span aria-hidden className="size-1.5 rounded-full bg-warning" />
      {copy.forms.datePicker.busyLegend}
    </p>
  );
}

function DateCalendar({
  value,
  onChange,
  firstDate,
  lastDate,
  unavailableDates = [],
  busyDates = [],
  className,
}: CalendarSettings & { className?: string }) {
  const selected = value ? visitDateToCalendarDate(value) : undefined;
  return (
    <div className="flex flex-col gap-2">
      <Calendar
        mode="single"
        required
        selected={selected}
        defaultMonth={selected ?? visitDateToCalendarDate(firstDate)}
        startMonth={visitDateToCalendarDate(firstDate)}
        endMonth={visitDateToCalendarDate(lastDate)}
        disabled={disabledDays(firstDate, lastDate, unavailableDates)}
        modifiers={{ busy: busyDates.map(visitDateToCalendarDate) }}
        modifiersClassNames={{ busy: BUSY_DOT }}
        onSelect={(date) => {
          onChange(calendarDateToVisitDate(date));
        }}
        className={className}
      />
      {busyDates.length > 0 && <BusyLegend />}
    </div>
  );
}

function DatePickerTrigger({
  value,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { value: string | undefined }) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        'w-full justify-start font-normal',
        !value && 'text-muted-foreground',
        className,
      )}
      {...props}
    >
      <CalendarDays aria-hidden />
      {value ? formatDateLong(value) : copy.forms.datePicker.placeholder}
    </Button>
  );
}

// docs/StyleGuide.md §5.6: a popover calendar from md up, the calendar inline and full width below md
// (where a popover would cover the form). Months and days are in Indonesian.
export function DatePicker({
  value,
  onChange,
  firstDate,
  lastDate,
  unavailableDates,
  busyDates,
  ...triggerProps
}: DatePickerProps) {
  const isDesktop = useMediaQuery(MEDIA_MD_UP);
  const [open, setOpen] = useState(false);
  const settings = { value, firstDate, lastDate, unavailableDates, busyDates };

  if (!isDesktop) {
    return (
      <DateCalendar
        {...settings}
        onChange={onChange}
        className="w-full rounded-xl border border-border"
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <DatePickerTrigger value={value} {...triggerProps} />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <DateCalendar
          {...settings}
          onChange={(visitDate) => {
            onChange(visitDate);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
