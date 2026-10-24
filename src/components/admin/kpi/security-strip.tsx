import { Eye, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { StatusBadge } from '@/components/admin/status/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SECURITY_ALERTS_PATH } from '@/config/dashboard';
import { copy } from '@/lib/copy/id';
import { formatDateTimeShort } from '@/lib/utils/dates';
import type { OpenSecurityAlert } from '@/types/dashboard-stats';

const text = copy.dashboard.overview.security;
const numberFormat = new Intl.NumberFormat('id-ID');

export interface SecurityStripProps {
  alerts: OpenSecurityAlert[];
  openCount: number;
  piiRevealsToday: number;
}

function AlertList({ alerts, openCount }: Pick<SecurityStripProps, 'alerts' | 'openCount'>) {
  if (alerts.length === 0) {
    return (
      <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
        <ShieldCheck aria-hidden className="size-4" />
        {text.none}
      </p>
    );
  }
  const hidden = openCount - alerts.length;
  return (
    <ul className="flex flex-col divide-y">
      {alerts.map((alert) => (
        <li key={alert.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
          <StatusBadge kind="alert_severity" value={alert.severity} />
          <span className="min-w-0 flex-1 text-body-sm font-medium">{alert.title}</span>
          <span className="text-caption text-muted-foreground tabular-nums">
            {`${text.occurrences(alert.occurrences)} · ${formatDateTimeShort(alert.lastSeenAt)}`}
          </span>
        </li>
      ))}
      {hidden > 0 ? (
        <li className="py-2 text-caption text-muted-foreground">{text.more(hidden)}</li>
      ) : null}
    </ul>
  );
}

// Task P4.2.03: the superadmin's open security_alerts and today's contact reveals (docs/Security.md DATA-04).
export function SecurityStrip({ alerts, openCount, piiRevealsToday }: SecurityStripProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-h4">{text.title}</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link href={SECURITY_ALERTS_PATH}>{text.viewAll}</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AlertList alerts={alerts} openCount={openCount} />
        <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2">
          <Eye aria-hidden className="size-4 text-muted-foreground" />
          <p className="flex-1 text-body-sm">
            {text.piiReveals}
            <span className="sr-only">: </span>
          </p>
          <span className="text-h4 tabular-nums">{numberFormat.format(piiRevealsToday)}</span>
        </div>
        <p className="text-caption text-muted-foreground">{text.piiRevealsHint}</p>
      </CardContent>
    </Card>
  );
}
