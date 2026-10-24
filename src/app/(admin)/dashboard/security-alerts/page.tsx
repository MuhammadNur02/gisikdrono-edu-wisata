import type { Metadata } from 'next';

import { AlertList } from '@/components/admin/security/alert-list';
import { FilterBar, type FilterField } from '@/components/admin/security/filter-bar';
import { PageLinks } from '@/components/admin/security/page-links';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { SECURITY_ALERTS_PATH } from '@/config/staff';
import { ALERT_SEVERITY } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { securityCopy } from '@/lib/copy/security';
import { ALERT_STATES, parseAlertFilter, type AlertFilter } from '@/lib/validations/security';
import { acknowledgeSecurityAlertAction } from '@/server/actions/security-alerts';
import { verifyStaffTotpAction } from '@/server/actions/staff-totp';
import { requireDashboardStaff } from '@/server/auth/session';
import { listSecurityAlerts } from '@/server/services/security-service';

const text = securityCopy.alerts;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ALERT_ACTIONS = {
  acknowledgeAction: acknowledgeSecurityAlertAction,
  stepUpAction: verifyStaffTotpAction,
};

function filterFields(filter: AlertFilter): FilterField[] {
  return [
    {
      kind: 'select',
      name: 'severity',
      label: text.severity,
      value: filter.severity,
      options: DB_ENUMS.alert_severity.map((value) => ({
        value,
        label: ALERT_SEVERITY[value].label,
      })),
    },
    {
      kind: 'select',
      name: 'state',
      label: text.state,
      value: filter.state,
      options: ALERT_STATES.map((value) => ({ value, label: text.states[value] })),
    },
  ];
}

// Task P4.10.02 (OPS-02): security_alerts newest first, filtered by severity and by whether they are handled. The
// superadmin's alone: RLS shows an RW admin nothing, and the page says so instead.
export default async function SecurityAlertsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  if (ctx.role !== 'superadmin') {
    return (
      <>
        <DashboardPageHeader title={text.title} />
        <FormAlert tone="info">{securityCopy.onlySuper}</FormAlert>
      </>
    );
  }
  const filter = parseAlertFilter(await searchParams);
  const alerts = await listSecurityAlerts(filter);
  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} />
      <div className="space-y-4">
        <FilterBar fields={filterFields(filter)} resetHref={SECURITY_ALERTS_PATH} />
        <AlertList alerts={alerts.rows} actions={ALERT_ACTIONS} />
        <PageLinks
          basePath={SECURITY_ALERTS_PATH}
          params={{ severity: filter.severity, state: filter.state }}
          page={alerts.page}
          hasNext={alerts.hasNext}
        />
      </div>
    </>
  );
}
