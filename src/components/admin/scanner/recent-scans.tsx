import { StatusBadge } from '@/components/admin/status/status-badge';
import { scannerCopy } from '@/lib/copy/scanner';
import type { RecentScan } from '@/lib/scanner/scan-flow';
import { formatDateTimeShort } from '@/lib/utils/dates';

const text = scannerCopy;

// docs/StyleGuide.md §6.6: the last ten answers of this session on this device (badge, time, institution). Kept in
// memory only, so nothing about a group outlives the page.
export function RecentScans({ scans }: { scans: readonly RecentScan[] }) {
  return (
    <section aria-labelledby="recent-scans-title" className="space-y-3">
      <h2 id="recent-scans-title" className="text-h4">
        {text.recent.title}
      </h2>
      {scans.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">{text.recent.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {scans.map((scan) => (
            <li key={scan.attemptId} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
              <StatusBadge kind="scan_result" value={scan.result} />
              <span className="min-w-0 flex-1 truncate text-body-sm">
                {scan.institutionName ?? text.card.individual}
              </span>
              <time dateTime={scan.at} className="text-caption text-muted-foreground tabular-nums">
                {formatDateTimeShort(scan.at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
