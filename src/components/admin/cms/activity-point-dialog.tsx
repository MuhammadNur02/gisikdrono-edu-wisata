'use client';

import { ActivityPointForm } from '@/components/admin/cms/activity-point-form';
import {
  activityPointValues,
  blankActivityPoint,
} from '@/components/admin/cms/activity-point-values';
import { FormDialog } from '@/components/admin/cms/form-dialog';
import type { RwId } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import type { ActionResult } from '@/types/action-result';
import type { ActivityPointAdmin } from '@/types/cms';

const text = copy.cms.points;

export interface ActivityPointDialogProps {
  rwId: RwId;
  // null for a new point.
  point: ActivityPointAdmin | null;
  action: (values: unknown) => Promise<ActionResult<ActivityPointAdmin>>;
}

export function ActivityPointDialog({ rwId, point, action }: ActivityPointDialogProps) {
  const trigger = point
    ? { label: copy.cms.common.edit, variant: 'ghost' as const, size: 'sm' as const }
    : { label: text.add };
  return (
    <FormDialog trigger={trigger} title={point ? text.editTitle : text.addTitle}>
      {(close) => (
        <ActivityPointForm
          point={point ? activityPointValues(point) : blankActivityPoint()}
          rwId={rwId}
          action={action}
          onSaved={close}
        />
      )}
    </FormDialog>
  );
}
