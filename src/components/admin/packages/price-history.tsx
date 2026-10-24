import { History } from 'lucide-react';

import { EmptyState } from '@/components/admin/shell/empty-state';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { packagesCopy } from '@/lib/copy/packages';
import { formatDateTimeShort } from '@/lib/utils/dates';
import { describePriceChange } from '@/lib/utils/price-history';
import type { PriceHistoryEntry } from '@/types/package';

const text = packagesCopy.history;

// package_price_history, newest first (Task P4.3.05, REC-13): the database writes a row on every price change, so a
// booking's snapshot can always be traced back to the price it was made at.
export function PriceHistory({ entries }: { entries: readonly PriceHistoryEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState icon={History} title={text.empty} description={text.emptyHint} />;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableCaption className="sr-only">{packagesCopy.sections.history}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>{text.changedAt}</TableHead>
            <TableHead>{text.change}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="align-top whitespace-nowrap tabular-nums">
                {formatDateTimeShort(entry.changedAt)}
              </TableCell>
              <TableCell className="whitespace-normal">
                {describePriceChange(entry).map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
