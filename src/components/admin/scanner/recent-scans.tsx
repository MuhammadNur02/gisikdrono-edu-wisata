import Link from 'next/link';

import { StatusBadge } from '@/components/admin/status/status-badge';
import { ATTENDANCE_PATH } from '@/config/attendance';
import { scannerCopy } from '@/lib/copy/scanner';
import type { RecentScan } from '@/lib/scanner/scan-flow';
import { formatClock, formatDateTimeShort } from '@/lib/utils/dates';

const text = scannerCopy;

function ScanRow({ scan }: { scan: RecentScan }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 text-caption">
      <time
        dateTime={scan.at}
        title={formatDateTimeShort(scan.at)}
        className="w-11 shrink-0 font-semibold text-muted-foreground tabular-nums"
      >
        {formatClock(scan.at)}
      </time>
      <span className="min-w-0 flex-1 truncate text-ink-2">
        {scan.institutionName ?? text.card.individual}
      </span>
      <StatusBadge kind="scan_result" value={scan.result} />
    </li>
  );
}

// docs/StyleGuide.md §6.6 (Dasbor Gelap): the last ten answers of this session on this device, one card beside the
// camera: the time, the group and the answer's badge. Kept in memory only, so nothing about a group outlives the page.
export function RecentScans({ scans }: { scans: readonly RecentScan[] }) {
  return (
    <section
      aria-labelledby="recent-scans-title"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 id="recent-scans-title" className="text-caption font-semibold text-foreground">
          {text.recent.title}
        </h2>
        <Link
          href={ATTENDANCE_PATH}
          className="rounded-sm text-caption font-medium text-ink-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {text.recent.attendance}
        </Link>
      </div>
      {scans.length === 0 ? (
        <p className="border-t border-border px-4 py-4 text-caption text-muted-foreground">
          {text.recent.empty}
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {scans.map((scan) => (
            <ScanRow key={scan.attemptId} scan={scan} />
          ))}
        </ul>
      )}
    </section>
  );
}
