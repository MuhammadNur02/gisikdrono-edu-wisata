import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { financeCopy } from '@/lib/copy/finance';
import { formatIDR } from '@/lib/utils/currency';
import { partyLabel, shareOfPeriod } from '@/lib/utils/finance-display';
import { sumOf } from '@/lib/utils/kpi';
import type { PartyBalance, PartyPeriodShare } from '@/types/finance';

const text = financeCopy.recap;

export interface PartyBalanceTableProps {
  balances: readonly PartyBalance[];
  shares: readonly PartyPeriodShare[];
}

// The party's part of the period as a bar and its number, which is what a reader takes in (Dasbor Gelap).
function ShareBar({ percent }: { percent: number }) {
  return (
    <span className="flex items-center justify-end gap-2" aria-label={text.shareLabel(percent)}>
      <span
        aria-hidden
        className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block"
      >
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${String(percent)}%` }}
        />
      </span>
      <span className="w-10 text-right text-caption font-semibold tabular-nums">{percent} %</span>
    </span>
  );
}

function BalanceRows({
  balances,
  periodNet,
  periodTotal,
}: {
  balances: readonly PartyBalance[];
  periodNet: Map<string, number>;
  periodTotal: number;
}) {
  return (
    <TableBody>
      {balances.map((balance) => {
        const net = periodNet.get(balance.beneficiaryKey) ?? 0;
        return (
          <TableRow key={balance.beneficiaryKey}>
            <TableCell className="h-14 px-4 font-medium">
              {partyLabel(balance.beneficiaryKey, balance.name || null)}
            </TableCell>
            <TableCell className="px-4 text-right font-semibold tabular-nums">
              {formatIDR(net)}
            </TableCell>
            <TableCell className="px-4">
              <ShareBar percent={shareOfPeriod(net, periodTotal)} />
            </TableCell>
            <TableCell className="px-4 text-right tabular-nums">
              {formatIDR(balance.accrued)}
            </TableCell>
            <TableCell className="px-4 text-right tabular-nums">
              {formatIDR(balance.paidOut)}
            </TableCell>
            <TableCell className="px-4 text-right font-semibold tabular-nums">
              {formatIDR(balance.outstanding)}
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  );
}

function TotalRow({
  balances,
  periodTotal,
}: {
  balances: readonly PartyBalance[];
  periodTotal: number;
}) {
  return (
    <TableFooter className="bg-muted">
      <TableRow className="hover:bg-muted">
        <TableCell className="px-4 font-semibold">{text.partiesTotal}</TableCell>
        <TableCell className="px-4 text-right font-semibold tabular-nums">
          {formatIDR(periodTotal)}
        </TableCell>
        <TableCell />
        <TableCell className="px-4 text-right tabular-nums">
          {formatIDR(sumOf(balances, (b) => b.accrued))}
        </TableCell>
        <TableCell className="px-4 text-right tabular-nums">
          {formatIDR(sumOf(balances, (b) => b.paidOut))}
        </TableCell>
        <TableCell className="px-4 text-right font-semibold tabular-nums">
          {formatIDR(sumOf(balances, (b) => b.outstanding))}
        </TableCell>
      </TableRow>
    </TableFooter>
  );
}

const HEADS = [
  { key: 'party', label: text.columns.party, isNumber: false },
  { key: 'period', label: text.columns.period, isNumber: true },
  { key: 'share', label: text.columns.share, isNumber: true },
  { key: 'accrued', label: text.columns.accrued, isNumber: true },
  { key: 'paidOut', label: text.columns.paidOut, isNumber: true },
  { key: 'outstanding', label: text.columns.outstanding, isNumber: true },
] as const;

// Task P4.7.01, Dasbor Gelap: each party's share of the period with its bar, and its balance in all
// (v_revenue_recap_by_party): the kelurahan, each RW treasury and each UMKM vendor, as the ledger holds them. The totals
// are sums of these rows as the server gave them; nothing is computed from bookings here (CLAUDE.md §7.1).
export function PartyBalanceTable({ balances, shares }: PartyBalanceTableProps) {
  const periodNet = new Map(shares.map((share) => [share.beneficiaryKey, share.net]));
  const periodTotal = sumOf(shares, (share) => share.net);
  return (
    <section
      aria-labelledby="party-balances"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex flex-col gap-1 px-4 py-4 md:px-5">
        <h2 id="party-balances" className="text-body-md font-bold text-foreground">
          {text.partiesTitle}
        </h2>
        <p className="text-caption text-muted-foreground">{text.partiesDescription}</p>
      </div>
      {balances.length === 0 ? (
        <p className="border-t border-border px-4 py-4 text-caption text-muted-foreground md:px-5">
          {text.partiesEmpty}
        </p>
      ) : (
        <Table>
          <TableHeader className="bg-muted">
            <TableRow className="hover:bg-transparent">
              {HEADS.map((head) => (
                <TableHead
                  key={head.key}
                  className={`h-9 px-4 text-micro font-semibold text-muted-foreground ${head.isNumber ? 'text-right' : ''}`}
                >
                  {head.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <BalanceRows balances={balances} periodNet={periodNet} periodTotal={periodTotal} />
          <TotalRow balances={balances} periodTotal={periodTotal} />
        </Table>
      )}
    </section>
  );
}
