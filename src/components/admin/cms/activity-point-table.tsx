import { ActivityPointDialog } from '@/components/admin/cms/activity-point-dialog';
import { RemoveButton } from '@/components/admin/cms/remove-button';
import { ContentStatusBadge } from '@/components/admin/status/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { rwLabel } from '@/config/rw';
import { ACTIVITY_POINT_TYPE } from '@/config/status';
import { copy } from '@/lib/copy/id';
import type { ActionResult } from '@/types/action-result';
import type { ActivityPointAdmin } from '@/types/cms';
import type { RwUnitSummary } from '@/types/rw-unit';

const text = copy.cms.points;
const common = copy.cms.common;

interface PointActions {
  updateAction: (values: unknown) => Promise<ActionResult<ActivityPointAdmin>>;
  removeAction: (input: unknown) => Promise<ActionResult<null>>;
}

export interface ActivityPointTableProps extends PointActions {
  points: ActivityPointAdmin[];
  // Every RW, for the slug prefix each point's form shows (the RW page it is a section of).
  rwUnits: readonly RwUnitSummary[];
  showRw: boolean;
}

function PointRow({
  point,
  pagePath,
  showRw,
  updateAction,
  removeAction,
}: PointActions & { point: ActivityPointAdmin; pagePath: string; showRw: boolean }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{point.name}</TableCell>
      <TableCell>{ACTIVITY_POINT_TYPE[point.pointType].label}</TableCell>
      {showRw ? <TableCell>{rwLabel(point.rwId)}</TableCell> : null}
      <TableCell>
        <ContentStatusBadge status={point.status} />
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <ActivityPointDialog
            rwId={point.rwId}
            pagePath={pagePath}
            point={point}
            action={updateAction}
          />
          <RemoveButton id={point.id} noun={text.noun} name={point.name} action={removeAction} />
        </div>
      </TableCell>
    </TableRow>
  );
}

// A provisional list (Task P2.9.06); P4.3.03 moves it onto the DataTable of docs/StyleGuide.md §6.4. Below md the
// table scrolls inside its own box, so the page itself never scrolls sideways.
export function ActivityPointTable({
  points,
  rwUnits,
  showRw,
  ...actions
}: ActivityPointTableProps) {
  const pagePathOf = (rwId: number) => rwUnits.find((unit) => unit.id === rwId)?.path ?? '';
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{text.name}</TableHead>
            <TableHead>{text.pointType}</TableHead>
            {showRw ? <TableHead>{common.owner}</TableHead> : null}
            <TableHead>{common.status}</TableHead>
            <TableHead className="text-right">{common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {points.map((point) => (
            <PointRow
              key={point.id}
              point={point}
              pagePath={pagePathOf(point.rwId)}
              showRw={showRw}
              {...actions}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
