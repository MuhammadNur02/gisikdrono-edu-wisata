import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { financeCopy } from '@/lib/copy/finance';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateShort, formatDateTimeShort } from '@/lib/utils/dates';
import { partyLabel } from '@/lib/utils/finance-display';
import type { PartyBalance, PayoutBatch } from '@/types/finance';

const text = financeCopy.payouts;

export interface PayoutTableProps {
  payouts: readonly PayoutBatch[];
  balances: readonly PartyBalance[];
  // "Catat pembayaran", beside the title.
  action: ReactNode;
}

function PayoutRows({ payouts, balances }: Omit<PayoutTableProps, 'action'>) {
  const names = new Map(balances.map((balance) => [balance.beneficiaryKey, balance.name || null]));
  return (
    <TableBody>
      {payouts.map((payout) => (
        <TableRow key={payout.id}>
          <TableCell className="font-medium">
            {partyLabel(payout.beneficiaryKey, names.get(payout.beneficiaryKey) ?? null)}
          </TableCell>
          <TableCell className="whitespace-nowrap tabular-nums">
            {formatDateShort(payout.periodFrom)} – {formatDateShort(payout.periodTo)}
          </TableCell>
          <TableCell className="text-right tabular-nums">{formatIDR(payout.totalAmount)}</TableCell>
          <TableCell>{payout.reference ?? '–'}</TableCell>
          <TableCell className="whitespace-nowrap tabular-nums">
            {payout.paidAt ? formatDateTimeShort(payout.paidAt) : '–'}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

// Task P4.7.02: the payouts recorded through settle_revenue_entries, newest first, each with the transfer it names.
export function PayoutTable({ payouts, balances, action }: PayoutTableProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle className="text-h4">{text.title}</CardTitle>
          <CardDescription>{text.description}</CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {payouts.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{text.empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{text.columns.party}</TableHead>
                <TableHead>{text.columns.period}</TableHead>
                <TableHead className="text-right">{text.columns.amount}</TableHead>
                <TableHead>{text.columns.reference}</TableHead>
                <TableHead>{text.columns.paidAt}</TableHead>
              </TableRow>
            </TableHeader>
            <PayoutRows payouts={payouts} balances={balances} />
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
