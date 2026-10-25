'use client';

import { useId } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useListQuery } from '@/hooks/use-list-query';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';

const text = bookingsAdminCopy.list;

// The `?date=` of /dashboard/bookings (Task P4.3.02): the bookings whose visit covers that day. Empty clears it.
export function VisitDateFilter({ date }: { date: string | null }) {
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
        value={date ?? ''}
        disabled={isPending}
        aria-describedby={hintId}
        onChange={(event) => {
          const value = event.target.value;
          update({ date: value === '' ? null : value });
        }}
      />
      <p id={hintId} className="text-caption text-muted-foreground">
        {text.dateHint}
      </p>
    </div>
  );
}
