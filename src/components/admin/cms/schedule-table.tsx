import { RemoveButton } from '@/components/admin/cms/remove-button';
import { ScheduleDialog } from '@/components/admin/cms/schedule-dialog';
import { ContentStatusBadge } from '@/components/admin/status/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { RwId } from '@/config/rw';
import { SCHEDULE_TYPE_LABELS } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { formatDateShort, formatInstantTimeRange } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { ScheduleAdmin, SchedulePackageOption } from '@/types/cms';

const text = copy.cms.schedules;
const common = copy.cms.common;

interface ScheduleActions {
  updateAction: (values: unknown) => Promise<ActionResult<ScheduleAdmin>>;
  removeAction: (input: unknown) => Promise<ActionResult<null>>;
}

export interface ScheduleTableProps extends ScheduleActions {
  rwId: RwId;
  schedules: ScheduleAdmin[];
  packages: SchedulePackageOption[];
}

function ScheduleRow({
  rwId,
  schedule,
  packages,
  updateAction,
  removeAction,
}: ScheduleActions & { rwId: RwId; schedule: ScheduleAdmin; packages: SchedulePackageOption[] }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{schedule.title}</TableCell>
      <TableCell>{SCHEDULE_TYPE_LABELS[schedule.scheduleType]}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {formatDateShort(schedule.startsAt)} ·{' '}
        {formatInstantTimeRange(schedule.startsAt, schedule.endsAt)}
      </TableCell>
      <TableCell>
        <ContentStatusBadge status={schedule.status} />
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <ScheduleDialog
            rwId={rwId}
            schedule={schedule}
            packages={packages}
            action={updateAction}
          />
          <RemoveButton
            id={schedule.id}
            noun={text.noun}
            name={schedule.title}
            action={removeAction}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

// A provisional list (Task P2.9.06), newest first; P4.3.03 moves it onto the DataTable.
export function ScheduleTable({ rwId, schedules, packages, ...actions }: ScheduleTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{text.titleField}</TableHead>
            <TableHead>{text.scheduleType}</TableHead>
            <TableHead>{text.startsAt}</TableHead>
            <TableHead>{common.status}</TableHead>
            <TableHead className="text-right">{common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {schedules.map((schedule) => (
            <ScheduleRow
              key={schedule.id}
              rwId={rwId}
              schedule={schedule}
              packages={packages}
              {...actions}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
