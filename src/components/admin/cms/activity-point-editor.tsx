'use client';

import { ActivityPointForm } from '@/components/admin/cms/activity-point-form';
import {
  activityPointValues,
  blankActivityPoint,
} from '@/components/admin/cms/activity-point-values';
import type { RwId } from '@/config/rw';
import type { ActionResult } from '@/types/action-result';
import type { ActivityPointAdmin } from '@/types/cms';

type PointAction = (values: unknown) => Promise<ActionResult<ActivityPointAdmin>>;

export interface ActivityPointEditorProps {
  rwId: RwId;
  // The RW's own page, which the point's slug is an anchor of.
  pagePath: string;
  // null for a new point.
  point: ActivityPointAdmin | null;
  actions: { create: PointAction; update: PointAction };
  onSaved: () => void;
}

// The activity point form inside the board's sheet (Task P4.3.03), loaded on the sheet's first opening with its map
// picker.
export function ActivityPointEditor({
  rwId,
  pagePath,
  point,
  actions,
  onSaved,
}: ActivityPointEditorProps) {
  return (
    <ActivityPointForm
      point={point ? activityPointValues(point) : blankActivityPoint()}
      rwId={rwId}
      pagePath={pagePath}
      action={point ? actions.update : actions.create}
      onSaved={onSaved}
    />
  );
}
