'use client';

import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import * as React from 'react';
import {
  DayPicker,
  getDefaultClassNames,
  type ChevronProps,
  type ClassNames,
  type DayButton,
  type WeekNumberProps,
} from 'react-day-picker';
import { id as indonesian } from 'react-day-picker/locale';

import { buttonVariants, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: ButtonProps['variant'];
};

interface ClassNameOptions {
  defaults: ClassNames;
  captionLayout: CalendarProps['captionLayout'];
  buttonVariant: CalendarProps['buttonVariant'];
}

function navigationClassNames({ defaults, captionLayout, buttonVariant }: ClassNameOptions) {
  const navButton = cn(
    buttonVariants({ variant: buttonVariant }),
    'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
  );
  return {
    root: cn('w-fit', defaults.root),
    months: cn('relative flex flex-col gap-4 md:flex-row', defaults.months),
    month: cn('flex w-full flex-col gap-4', defaults.month),
    nav: cn(
      'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
      defaults.nav,
    ),
    button_previous: cn(navButton, defaults.button_previous),
    button_next: cn(navButton, defaults.button_next),
    month_caption: cn(
      'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
      defaults.month_caption,
    ),
    dropdowns: cn(
      'flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium',
      defaults.dropdowns,
    ),
    dropdown_root: cn(
      'relative rounded-lg border border-input has-focus:border-ring has-focus:ring-2 has-focus:ring-ring',
      defaults.dropdown_root,
    ),
    dropdown: cn('absolute inset-0 bg-popover opacity-0', defaults.dropdown),
    caption_label: cn(
      'font-medium select-none',
      captionLayout === 'label'
        ? 'text-sm'
        : 'flex h-8 items-center gap-1 rounded-lg pr-1 pl-2 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground',
      defaults.caption_label,
    ),
  };
}

function gridClassNames(defaults: ClassNames, showWeekNumber: boolean | undefined) {
  return {
    month_grid: cn('w-full border-collapse', defaults.month_grid),
    weekdays: cn('flex', defaults.weekdays),
    weekday: cn(
      'flex-1 text-caption font-normal text-muted-foreground select-none',
      defaults.weekday,
    ),
    week: cn('mt-2 flex w-full', defaults.week),
    week_number_header: cn('w-(--cell-size) select-none', defaults.week_number_header),
    week_number: cn('text-caption text-muted-foreground select-none', defaults.week_number),
    day: cn(
      'group/day relative aspect-square h-full w-full p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-lg',
      showWeekNumber
        ? '[&:nth-child(2)[data-selected=true]_button]:rounded-l-lg'
        : '[&:first-child[data-selected=true]_button]:rounded-l-lg',
      defaults.day,
    ),
    range_start: cn('rounded-l-lg bg-accent', defaults.range_start),
    range_middle: cn('rounded-none', defaults.range_middle),
    range_end: cn('rounded-r-lg bg-accent', defaults.range_end),
    today: cn(
      'rounded-lg bg-accent text-accent-foreground data-[selected=true]:rounded-none',
      defaults.today,
    ),
    outside: cn('text-muted-foreground aria-selected:text-muted-foreground', defaults.outside),
    disabled: cn('text-muted-foreground opacity-50', defaults.disabled),
    hidden: cn('invisible', defaults.hidden),
  };
}

function CalendarRoot({
  className,
  rootRef,
  ...props
}: React.ComponentProps<'div'> & { rootRef?: React.Ref<HTMLDivElement> }) {
  return <div data-slot="calendar" ref={rootRef} className={className} {...props} />;
}

const CHEVRONS = {
  left: ChevronLeftIcon,
  right: ChevronRightIcon,
  up: ChevronDownIcon,
  down: ChevronDownIcon,
};

function CalendarChevron({ className, orientation = 'down' }: ChevronProps) {
  const Icon = CHEVRONS[orientation];
  return <Icon aria-hidden className={cn('size-4', className)} />;
}

function CalendarWeekNumber({ children, week, ...props }: WeekNumberProps) {
  return (
    <td data-week={week.weekNumber} {...props}>
      <div className="flex size-(--cell-size) items-center justify-center text-center">
        {children}
      </div>
    </td>
  );
}

// Indonesian month and day names by default. Day cells are 44 px below md (touch targets,
// docs/StyleGuide.md §5.0) and 36 px from md.
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  buttonVariant = 'ghost',
  components,
  locale = indonesian,
  ...props
}: CalendarProps) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={locale}
      className={cn(
        'group/calendar bg-background p-3 [--cell-size:--spacing(11)] md:[--cell-size:--spacing(9)] [[data-slot=popover-content]_&]:bg-transparent',
        className,
      )}
      captionLayout={captionLayout}
      classNames={{
        ...navigationClassNames({ defaults, captionLayout, buttonVariant }),
        ...gridClassNames(defaults, props.showWeekNumber),
        ...classNames,
      }}
      components={{
        Root: CalendarRoot,
        Chevron: CalendarChevron,
        DayButton: CalendarDayButton,
        WeekNumber: CalendarWeekNumber,
        ...components,
      }}
      {...props}
    />
  );
}

const DAY_BUTTON_CLASS_NAME =
  'flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 p-0 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-2 group-data-[focused=true]/day:ring-ring data-[range-end=true]:rounded-lg data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:rounded-lg data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground [&>span]:text-xs [&>span]:opacity-70';

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaults = getDefaultClassNames();
  const ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const isSingleSelection =
    modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle;

  return (
    <button
      ref={ref}
      data-day={day.isoDate}
      data-selected-single={isSingleSelection}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        buttonVariants({ variant: 'ghost' }),
        DAY_BUTTON_CLASS_NAME,
        defaults.day,
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
