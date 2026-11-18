import Link from 'next/link';

import { OverviewPanel } from '@/components/admin/overview/overview-panel';
import { Badge } from '@/components/ui/badge';
import { REVENUE_SHARE_PATH } from '@/config/finance';
import { financeCopy } from '@/lib/copy/finance';
import { cn } from '@/lib/utils/cn';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateShort, formatDateTimeShort } from '@/lib/utils/dates';
import { partyLabel } from '@/lib/utils/finance-display';
import type { LedgerEntryLine, PayoutBatch } from '@/types/finance';

const text = financeCopy.recent;

// The recap's newest payouts on the revenue-share page's own list.
const RECENT_PAYOUTS = 3;

function LedgerRow({ entry }: { entry: LedgerEntryLine }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-caption md:px-5">
      <time dateTime={entry.createdAt} className="w-36 shrink-0 text-muted-foreground tabular-nums">
        {formatDateTimeShort(entry.createdAt)}
      </time>
      <span className="min-w-0 flex-1">
        <span className="font-medium text-foreground">{text.entryTypes[entry.entryType]}</span>
        <span className="text-muted-foreground"> · {partyLabel(entry.beneficiaryKey, null)}</span>
      </span>
      <span
        className={cn(
          'font-semibold tabular-nums',
          entry.amount < 0 ? 'text-danger-soft-foreground' : 'text-success-soft-foreground',
        )}
      >
        {formatIDR(entry.amount)}
      </span>
    </li>
  );
}

// "Buku besar terbaru" (Dasbor Gelap): the five newest ledger rows the reader's session may see, newest first.
export function RecentLedgerPanel({ entries }: { entries: readonly LedgerEntryLine[] }) {
  return (
    <OverviewPanel title={text.ledgerTitle} description={text.ledgerDescription}>
      {entries.length === 0 ? (
        <p className="px-4 py-5 text-caption text-muted-foreground md:px-5">{text.ledgerEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {entries.map((entry) => (
            <LedgerRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </OverviewPanel>
  );
}

function PayoutRow({ payout }: { payout: PayoutBatch }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
      <span className="min-w-0 text-caption">
        <span className="block text-muted-foreground tabular-nums">
          {formatDateShort(payout.periodFrom)} – {formatDateShort(payout.periodTo)}
        </span>
        <span className="block font-semibold text-foreground">
          {partyLabel(payout.beneficiaryKey, null)} · {formatIDR(payout.totalAmount)}
        </span>
      </span>
      {payout.hasProof && payout.paidAt ? (
        <Badge variant="success">{text.payoutPaid(formatDateShort(payout.paidAt))}</Badge>
      ) : (
        <Badge variant="warning">{text.payoutNoProof}</Badge>
      )}
    </li>
  );
}

// "Batch pencairan" (Dasbor Gelap): the superadmin's three newest payouts and the way to the revenue-share page, where a
// batch is made with its proof.
export function PayoutsPanel({ payouts }: { payouts: readonly PayoutBatch[] }) {
  return (
    <OverviewPanel
      title={text.payoutsTitle}
      description={text.payoutsDescription}
      action={<Link href={REVENUE_SHARE_PATH}>{text.openAll}</Link>}
    >
      {payouts.length === 0 ? (
        <p className="px-4 py-5 text-caption text-muted-foreground md:px-5">{text.payoutsEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {payouts.slice(0, RECENT_PAYOUTS).map((payout) => (
            <PayoutRow key={payout.id} payout={payout} />
          ))}
        </ul>
      )}
      <div className="border-t border-border px-4 py-3 md:px-5">
        <Link
          href={REVENUE_SHARE_PATH}
          className="rounded-sm text-caption font-medium text-primary-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {text.newPayout}
        </Link>
      </div>
    </OverviewPanel>
  );
}
