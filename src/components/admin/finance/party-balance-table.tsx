import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { financeCopy } from '@/lib/copy/finance';
import { formatIDR } from '@/lib/utils/currency';
import { partyLabel } from '@/lib/utils/finance-display';
import type { PartyBalance, PartyPeriodShare } from '@/types/finance';

const text = financeCopy.recap;

export interface PartyBalanceTableProps {
  balances: readonly PartyBalance[];
  shares: readonly PartyPeriodShare[];
}

function BalanceRows({ balances, shares }: PartyBalanceTableProps) {
  const periodNet = new Map(shares.map((share) => [share.beneficiaryKey, share.net]));
  return (
    <TableBody>
      {balances.map((balance) => (
        <TableRow key={balance.beneficiaryKey}>
          <TableCell className="font-medium">
            {partyLabel(balance.beneficiaryKey, balance.name || null)}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {formatIDR(periodNet.get(balance.beneficiaryKey) ?? 0)}
          </TableCell>
          <TableCell className="text-right tabular-nums">{formatIDR(balance.accrued)}</TableCell>
          <TableCell className="text-right tabular-nums">{formatIDR(balance.paidOut)}</TableCell>
          <TableCell className="text-right font-medium tabular-nums">
            {formatIDR(balance.outstanding)}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

// Task P4.7.01: each party's share of the period and its balance in all (v_revenue_recap_by_party), the kelurahan, each
// RW treasury and each UMKM vendor, as the ledger holds them.
export function PartyBalanceTable({ balances, shares }: PartyBalanceTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h4">{text.partiesTitle}</CardTitle>
        <CardDescription>{text.partiesDescription}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {balances.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{text.partiesEmpty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{text.columns.party}</TableHead>
                <TableHead className="text-right">{text.columns.period}</TableHead>
                <TableHead className="text-right">{text.columns.accrued}</TableHead>
                <TableHead className="text-right">{text.columns.paidOut}</TableHead>
                <TableHead className="text-right">{text.columns.outstanding}</TableHead>
              </TableRow>
            </TableHeader>
            <BalanceRows balances={balances} shares={shares} />
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
