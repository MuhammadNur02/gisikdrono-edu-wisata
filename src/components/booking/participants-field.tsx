'use client';

import { useId, type ReactNode } from 'react';

import { ParticipantsEditor } from '@/components/forms/participants-editor';
import { BOOKING_LIMITS } from '@/config/booking';
import { copy } from '@/lib/copy/id';
import { namedRows } from '@/lib/utils/booking-wizard';
import type { ParticipantRow } from '@/types/forms';

const text = copy.booking.wizard.booker;

export interface ParticipantsFieldProps {
  rows: ParticipantRow[];
  onChange: (rows: ParticipantRow[]) => void;
  // The group size of step jadwal: the list never outgrows it.
  pax: number;
  error: string | undefined;
  // The guardian's consent, shown once a name is listed (docs/Security.md §7.6, PDP-01).
  consent: ReactNode;
}

// docs/PRD.md FR-B2B-09: names and class or group only, kept for the certificates and the attendance list.
export function ParticipantsField({ rows, onChange, pax, error, consent }: ParticipantsFieldProps) {
  const headingId = useId();
  return (
    <div className="space-y-3">
      <p id={headingId} className="text-h4 font-bold">
        {text.participantsTitle}
      </p>
      <p className="text-body-sm text-ink-2">{text.participantsHint}</p>
      <ParticipantsEditor
        aria-labelledby={headingId}
        value={rows}
        maxRows={Math.min(pax, BOOKING_LIMITS.participants)}
        onChange={onChange}
      />
      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
      {namedRows(rows).length > 0 && consent}
    </div>
  );
}
