import { Scale } from 'lucide-react';
import type { ReactNode } from 'react';

import { EmptyState } from '@/components/admin/shell/empty-state';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adjustmentsCopy } from '@/lib/copy/finance-adjustments';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateTimeShort } from '@/lib/utils/dates';
import type { Adjustment } from '@/types/finance';

const text = adjustmentsCopy;

export interface AdjustmentsTableProps {
  adjustments: readonly Adjustment[];
  // The row's next steps, an island of its own (AdjustmentActions).
  actionsFor: (adjustment: Adjustment) => ReactNode;
  // "Usulkan penyesuaian", repeated in the empty state as its one next step.
  proposeAction: ReactNode;
}

function AdjustmentRow({ adjustment, actions }: { adjustment: Adjustment; actions: ReactNode }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap tabular-nums">
        {formatDateTimeShort(adjustment.proposedAt)}
      </TableCell>
      <TableCell className="font-medium">{adjustment.bookingCode ?? '–'}</TableCell>
      <TableCell>
        <p>{text.types[adjustment.type]}</p>
        <p className="line-clamp-2 max-w-72 text-caption text-muted-foreground">
          {adjustment.reason}
        </p>
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatIDR(adjustment.amount)}</TableCell>
      <TableCell>
        <StatusBadge kind="adjustment_status" value={adjustment.status} />
        {adjustment.hasOpenKeyMismatch ? (
          <p className="mt-1 max-w-60 text-caption text-danger">{text.release.blocked}</p>
        ) : null}
        {adjustment.status === 'rejected' && adjustment.rejectedReason ? (
          <p className="mt-1 line-clamp-2 max-w-60 text-caption text-muted-foreground">
            {adjustment.rejectedReason}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="text-body-sm">
        {text.by(adjustment.proposedByName ?? '–', adjustment.approvedByName)}
      </TableCell>
      <TableCell>{actions}</TableCell>
    </TableRow>
  );
}

function AdjustmentsHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>{text.columns.proposedAt}</TableHead>
        <TableHead>{text.columns.booking}</TableHead>
        <TableHead>{text.columns.type}</TableHead>
        <TableHead className="text-right">{text.columns.amount}</TableHead>
        <TableHead>{text.columns.status}</TableHead>
        <TableHead>{text.columns.people}</TableHead>
        <TableHead>
          <span className="sr-only">{text.columns.action}</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

// Task P4.7.04: the adjustments newest first, with who proposed and approved each and what it can do next.
export function AdjustmentsTable({
  adjustments,
  actionsFor,
  proposeAction,
}: AdjustmentsTableProps) {
  if (adjustments.length === 0) {
    return (
      <EmptyState
        icon={Scale}
        title={text.empty}
        description={text.emptyHint}
        action={proposeAction}
      />
    );
  }
  return (
    <Card>
      <CardContent className="overflow-x-auto pt-6">
        <Table>
          <AdjustmentsHeader />
          <TableBody>
            {adjustments.map((adjustment) => (
              <AdjustmentRow
                key={adjustment.id}
                adjustment={adjustment}
                actions={actionsFor(adjustment)}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
