'use client';

import { ScheduleForm } from '@/components/admin/cms/schedule-form';
import { blankSchedule, scheduleValues, withRowId } from '@/components/admin/cms/schedule-values';
import type { RwId } from '@/config/rw';
import type { ActionResult } from '@/types/action-result';
import type { ScheduleAdmin, SchedulePackageOption } from '@/types/cms';

type ScheduleAction = (values: unknown) => Promise<ActionResult<ScheduleAdmin>>;

export interface ScheduleEditorProps {
  // The RW whose schedule this is, which the photo is uploaded for.
  rwId: RwId;
  // null for a new schedule.
  schedule: ScheduleAdmin | null;
  packages: SchedulePackageOption[];
  actions: { create: ScheduleAction; update: ScheduleAction };
  onSaved: () => void;
}

// The schedule form inside the board's sheet (Task P4.3.03), loaded on the sheet's first opening. An update carries
// the row's id beside the form's values, never through a form field.
export function ScheduleEditor({
  rwId,
  schedule,
  packages,
  actions,
  onSaved,
}: ScheduleEditorProps) {
  const send: ScheduleAction = schedule
    ? (values) => actions.update(withRowId(values, schedule.id))
    : actions.create;
  return (
    <ScheduleForm
      rwId={rwId}
      schedule={schedule ? scheduleValues(schedule) : blankSchedule()}
      packages={packages}
      action={send}
      onSaved={onSaved}
    />
  );
}
