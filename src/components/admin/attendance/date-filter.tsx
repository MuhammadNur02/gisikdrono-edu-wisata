'use client';

import { useId } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useListQuery } from '@/hooks/use-list-query';
import { attendanceCopy } from '@/lib/copy/attendance';

const text = attendanceCopy;

export interface DateFilterProps {
  // The day the page shows (attendanceDateOf), today, and the oldest day the history offers.
  date: string;
  today: string;
  earliest: string;
}

// The `?date=` of /dashboard/attendance (Task P4.3.09). Today clears the parameter, so the plain address is today.
export function DateFilter({ date, today, earliest }: DateFilterProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const { update, isPending } = useListQuery();
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{text.date}</Label>
      <Input
        id={id}
        type="date"
        className="min-h-11 w-full sm:w-44"
        value={date}
        min={earliest}
        max={today}
        disabled={isPending}
        aria-describedby={hintId}
        onChange={(event) => {
          const value = event.target.value;
          update({ date: value === '' || value === today ? null : value });
        }}
      />
      <p id={hintId} className="text-caption text-muted-foreground">
        {text.dateHint}
      </p>
    </div>
  );
}
