'use client';

import { FormDialog } from '@/components/admin/cms/form-dialog';
import { ScheduleForm } from '@/components/admin/cms/schedule-form';
import { blankSchedule, scheduleValues, withRowId } from '@/components/admin/cms/schedule-values';
import { copy } from '@/lib/copy/id';
import type { ActionResult } from '@/types/action-result';
import type { ScheduleAdmin, SchedulePackageOption } from '@/types/cms';

const text = copy.cms.schedules;

type ScheduleAction = (values: unknown) => Promise<ActionResult<ScheduleAdmin>>;

export interface ScheduleDialogProps {
  // null for a new schedule.
  schedule: ScheduleAdmin | null;
  packages: SchedulePackageOption[];
  // createScheduleAction for a new schedule, updateScheduleAction for one that exists.
  action: ScheduleAction;
}

export function ScheduleDialog({ schedule, packages, action }: ScheduleDialogProps) {
  const trigger = schedule
    ? { label: copy.cms.common.edit, variant: 'ghost' as const, size: 'sm' as const }
    : { label: text.add };
  const send: ScheduleAction = schedule
    ? (values) => action(withRowId(values, schedule.id))
    : action;
  return (
    <FormDialog trigger={trigger} title={schedule ? text.editTitle : text.addTitle}>
      {(close) => (
        <ScheduleForm
          schedule={schedule ? scheduleValues(schedule) : blankSchedule()}
          packages={packages}
          action={send}
          onSaved={close}
        />
      )}
    </FormDialog>
  );
}
