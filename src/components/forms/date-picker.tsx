'use client';

import { createContext, use, useEffect, useRef } from 'react';
import type * as React from 'react';
import {
  getDefaultClassNames,
  labelDayButton,
  type DayButton,
  type Matcher,
} from 'react-day-picker';

import { Calendar } from '@/components/ui/calendar';
import { copy } from '@/lib/copy/id';
import type { DayAvailability, DayState } from '@/lib/utils/booking-wizard';
import { cn } from '@/lib/utils/cn';
import { calendarDateToVisitDate, visitDateToCalendarDate } from '@/lib/utils/dates';
import { fieldLabelId } from '@/lib/utils/field-ids';

const text = copy.booking.wizard.schedule;

export interface DatePickerProps {
  // Visit dates as Postgres `date` strings ('2026-10-18'), computed on the server with bookableRange().
  value: string | undefined;
  onChange: (visitDate: string) => void;
  firstDate: string;
  lastDate: string;
  // Days with no open session or no room for the group, which cannot be chosen.
  unavailableDates?: readonly string[];
  // What each day with sessions says: its seats and its state (dayAvailability in booking-wizard.ts).
  days?: ReadonlyMap<string, DayAvailability>;
  // From FormControl: the field's id and its help and error text.
  id?: string;
  'aria-describedby'?: string;
}

// A day cell's words and colours (DESIGN-SPEC §2.4 Calendar day cell): seats in green or amber, "Penuh" in red,
// "Tutup" in the muted ink. Colour always comes with a word: in the cell from md, in the legend beside the dot below.
const STATE_TEXT: Record<DayState, string> = {
  open: 'text-success',
  busy: 'text-warning',
  full: 'text-destructive',
  closed: 'text-muted-foreground',
};

const STATE_DOT: Record<DayState, string> = {
  open: 'bg-success',
  busy: 'bg-warning',
  full: 'bg-destructive',
  closed: 'bg-border-strong',
};

interface DayFacts {
  days: ReadonlyMap<string, DayAvailability>;
  firstDate: string;
  lastDate: string;
}

// The cells read the day facts from context, so the calendar's components stay the same functions across the 15 s
// seat refresh and no day button is remounted under the visitor's focus.
const DayFactsContext = createContext<DayFacts>({
  days: new Map(),
  firstDate: '',
  lastDate: '',
});

function availabilityOf(facts: DayFacts, visitDate: string): DayAvailability | null {
  const known = facts.days.get(visitDate);
  if (known) return known;
  // A day inside the bookable range with no session at all is a closed day (Sunday, Monday, a holiday).
  return visitDate >= facts.firstDate && visitDate <= facts.lastDate
    ? { seats: 0, state: 'closed' }
    : null;
}

function dayWord(availability: DayAvailability): string {
  if (availability.state === 'full') return text.legend.full;
  if (availability.state === 'closed') return text.legend.closed;
  return text.daySeats(availability.seats);
}

function DayNote({
  availability,
  isSelected,
}: {
  availability: DayAvailability;
  isSelected: boolean;
}) {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          'text-caption leading-none font-medium tabular-nums max-md:hidden',
          isSelected ? 'text-secondary-foreground/75' : STATE_TEXT[availability.state],
        )}
      >
        {dayWord(availability)}
      </span>
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full md:hidden',
          isSelected ? 'bg-secondary-foreground/75' : STATE_DOT[availability.state],
        )}
      />
    </>
  );
}

const CELL =
  'flex h-13 w-full flex-col items-center justify-center gap-1 rounded-xl border border-transparent transition-colors duration-160 ease-out-soft md:h-16';

// shadcn's focus handling: the focus follows the day the arrow keys reach.
function useFocusedDay(isFocused: boolean) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isFocused) ref.current?.focus();
  }, [isFocused]);
  return ref;
}

type DayModifiers = React.ComponentProps<typeof DayButton>['modifiers'];

// Open: paper with a line; chosen: the ink fill; closed, full or past: no fill, and a past or outside day faded.
function cellClassName(modifiers: DayModifiers, availability: DayAvailability | null): string {
  const isSelected = Boolean(modifiers.selected);
  const isOpen = !modifiers.disabled && !modifiers.outside;
  const isFaded = Boolean(modifiers.outside) || (Boolean(modifiers.disabled) && !availability);
  return cn(
    CELL,
    isOpen && !isSelected && 'border-border-strong bg-background hover:bg-muted',
    isSelected && 'border-secondary bg-secondary text-secondary-foreground',
    !isOpen && 'cursor-default',
    isFaded && 'opacity-35',
  );
}

// One day: the number in the display face and the seats under it.
function SeatDayButton({
  day,
  modifiers,
  children,
  className,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const facts = use(DayFactsContext);
  const ref = useFocusedDay(Boolean(modifiers.focused));
  const availability = modifiers.outside
    ? null
    : availabilityOf(facts, calendarDateToVisitDate(day.date));
  const isSelected = Boolean(modifiers.selected);
  return (
    <button
      ref={ref}
      data-day={day.isoDate}
      className={cn(cellClassName(modifiers, availability), className)}
      {...props}
    >
      <span
        className={cn(
          'text-h4 leading-none tabular-nums',
          availability?.state === 'full' && !isSelected && 'line-through',
        )}
      >
        {children}
      </span>
      {availability && <DayNote availability={availability} isSelected={isSelected} />}
    </button>
  );
}

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

const LEGEND: readonly DayState[] = ['open', 'busy', 'full', 'closed'];

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-ink-2 max-md:order-last md:absolute md:top-3 md:right-0">
      {LEGEND.map((state) => (
        <li key={state} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2 rounded-full', STATE_DOT[state])} />
          {text.legend[state]}
        </li>
      ))}
    </ul>
  );
}

const defaults = getDefaultClassNames();
const NAV_BUTTON =
  'inline-flex size-11 items-center justify-center rounded-full border border-border-strong text-foreground transition-colors duration-160 hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-40';

// DESIGN-SPEC §2.4 and §3.10: the month inline, never in a popover, so every day shows its seats. Previous, month and
// next across the top (the month first and the arrows on the right on a phone), the legend at the right from md.
const CALENDAR_CLASS_NAMES = {
  root: cn('w-full', defaults.root),
  months: cn('relative', defaults.months),
  month: cn('flex w-full flex-wrap items-center gap-x-2 gap-y-4', defaults.month),
  month_caption: cn('max-md:order-first max-md:mr-auto', defaults.month_caption),
  caption_label: cn('px-1 text-h4 font-bold whitespace-nowrap', defaults.caption_label),
  button_previous: cn(NAV_BUTTON, defaults.button_previous),
  button_next: cn(NAV_BUTTON, defaults.button_next),
  month_grid: cn('w-full basis-full border-collapse', defaults.month_grid),
  weekdays: cn('flex', defaults.weekdays),
  weekday: cn('flex-1 pb-1 text-caption font-semibold text-muted-foreground', defaults.weekday),
  week: cn('flex w-full', defaults.week),
  day: cn('flex-1 p-0.5 text-center md:p-1', defaults.day),
  today: defaults.today,
  outside: defaults.outside,
  disabled: cn('text-muted-foreground', defaults.disabled),
};

function SeatCalendar({
  value,
  onChange,
  facts,
  unavailableDates,
}: Pick<DatePickerProps, 'value' | 'onChange'> & {
  facts: DayFacts;
  unavailableDates: readonly string[];
}) {
  const selected = value ? visitDateToCalendarDate(value) : undefined;
  return (
    <Calendar
      mode="single"
      required
      navLayout="around"
      selected={selected}
      defaultMonth={selected ?? visitDateToCalendarDate(facts.firstDate)}
      startMonth={visitDateToCalendarDate(facts.firstDate)}
      endMonth={visitDateToCalendarDate(facts.lastDate)}
      disabled={disabledDays(facts.firstDate, facts.lastDate, unavailableDates)}
      onSelect={(date) => {
        onChange(calendarDateToVisitDate(date));
      }}
      labels={{
        labelDayButton: (date, modifiers, options) => {
          const availability = availabilityOf(facts, calendarDateToVisitDate(date));
          const name = labelDayButton(date, modifiers, options);
          return availability ? `${name}, ${dayWord(availability)}` : name;
        },
      }}
      components={{ DayButton: SeatDayButton }}
      classNames={CALENDAR_CLASS_NAMES}
      className="bg-transparent p-0"
    />
  );
}

// docs/StyleGuide.md §5.6: the calendar sits in the form as a group, named by the field's label (which carries
// "wajib" for a required field) and described by its help and error text. aria-invalid and aria-required stay off:
// neither is allowed on a group (axe aria-allowed-attr); the linked error message says it instead. Months and days
// are in Indonesian, and each day's name tells its seats too.
export function DatePicker({
  value,
  onChange,
  firstDate,
  lastDate,
  unavailableDates = [],
  days = new Map(),
  id,
  'aria-describedby': describedBy,
}: DatePickerProps) {
  const facts = { days, firstDate, lastDate };
  return (
    <div
      role="group"
      id={id}
      aria-labelledby={id ? fieldLabelId(id) : undefined}
      aria-describedby={describedBy}
      className="relative flex flex-col gap-4"
    >
      <Legend />
      <DayFactsContext value={facts}>
        <SeatCalendar
          value={value}
          onChange={onChange}
          facts={facts}
          unavailableDates={unavailableDates}
        />
      </DayFactsContext>
    </div>
  );
}
