import type { ReactNode } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { rwLabel } from '@/config/rw';
import { adjustmentsCopy } from '@/lib/copy/finance-adjustments';
import { formatDateTimeShort } from '@/lib/utils/dates';
import type { HeldWeatherLinkRow, HeldWeatherLinks } from '@/types/weather-links';

const text = adjustmentsCopy.weatherLinks;

export interface HeldWeatherLinksCardProps {
  links: HeldWeatherLinks;
  // The row's "Tutup tanpa refund", an island of its own (ResolveWeatherLinkDialog).
  actionFor: (link: HeldWeatherLinkRow) => ReactNode;
}

function HeldLinkRow({ link, action }: { link: HeldWeatherLinkRow; action: ReactNode }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{link.bookingCode}</TableCell>
      <TableCell>{rwLabel(link.rwId)}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {formatDateTimeShort(link.openUntil)}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {formatDateTimeShort(link.heldAt)}
      </TableCell>
      <TableCell>{text.reasons[link.heldReason]}</TableCell>
      <TableCell className="text-right">{action}</TableCell>
    </TableRow>
  );
}

// Task P4.7.06: the weather links the sweep holds, oldest first, each closed by a manual refund proposal naming it or
// here without a refund. Shown only while there is one, as a to-do above the adjustments.
export function HeldWeatherLinksCard({ links, actionFor }: HeldWeatherLinksCardProps) {
  if (links.items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h4">{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 overflow-x-auto">
        {links.hasMore ? <FormAlert tone="info">{text.more}</FormAlert> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{text.columns.booking}</TableHead>
              <TableHead>{text.columns.rw}</TableHead>
              <TableHead>{text.columns.window}</TableHead>
              <TableHead>{text.columns.heldAt}</TableHead>
              <TableHead>{text.columns.reason}</TableHead>
              <TableHead>
                <span className="sr-only">{text.columns.action}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.items.map((link) => (
              <HeldLinkRow key={link.id} link={link} action={actionFor(link)} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
