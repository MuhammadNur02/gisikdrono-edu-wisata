import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { AcknowledgeButton } from '@/components/admin/security/acknowledge-button';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { AUDIT_LOGS_PATH } from '@/config/staff';
import { securityCopy } from '@/lib/copy/security';
import { formatDateTimeShort } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { SecurityAlertRow } from '@/types/security';

const text = securityCopy.alerts;

type FormAction = (values: unknown) => Promise<ActionResult<null>>;

interface AlertActions {
  acknowledgeAction: FormAction;
  stepUpAction: FormAction;
}

function entityHref(entity: NonNullable<SecurityAlertRow['entity']>): string {
  return `${AUDIT_LOGS_PATH}?entity=${entity.type}&entityId=${entity.id}`;
}

function AlertMeta({ alert }: { alert: SecurityAlertRow }) {
  return (
    <p className="text-caption text-muted-foreground">
      {text.rule}: {alert.rule} · {text.occurrences(alert.occurrences)} ·{' '}
      {text.firstSeen(formatDateTimeShort(alert.firstSeenAt))}
      {alert.notifiedAt ? ` · ${text.notified}` : null}
      {alert.acknowledgedAt
        ? ` · ${text.acknowledgedAt(formatDateTimeShort(alert.acknowledgedAt))}`
        : null}
    </p>
  );
}

function AlertItem({ alert, actions }: { alert: SecurityAlertRow; actions: AlertActions }) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind="alert_severity" value={alert.severity} />
          <span className="text-caption text-muted-foreground">
            {text.seen} {formatDateTimeShort(alert.lastSeenAt)}
          </span>
        </div>
        <p className="font-medium">{alert.title}</p>
        <AlertMeta alert={alert} />
        {alert.entity ? (
          <Link
            href={entityHref(alert.entity)}
            className="text-body-sm underline underline-offset-4"
          >
            {text.entityLink}
          </Link>
        ) : null}
      </div>
      {alert.acknowledgedAt === null ? (
        <AcknowledgeButton alertId={alert.id} title={alert.title} {...actions} />
      ) : null}
    </li>
  );
}

// Task P4.10.02: the alerts newest first, as a list that reads the same at 360 px; nothing in it animates.
export function AlertList({
  alerts,
  actions,
}: {
  alerts: readonly SecurityAlertRow[];
  actions: AlertActions;
}) {
  if (alerts.length === 0) {
    return <EmptyState icon={ShieldCheck} title={text.empty} description={text.emptyHint} />;
  }
  return (
    <section aria-label={text.caption} className="rounded-xl border border-border px-4">
      <ul className="divide-y divide-border">
        {alerts.map((alert) => (
          <AlertItem key={alert.id} alert={alert} actions={actions} />
        ))}
      </ul>
    </section>
  );
}
