import type { Metadata } from 'next';

import { AuditLogList } from '@/components/admin/security/audit-log-list';
import { FilterBar, type FilterField } from '@/components/admin/security/filter-bar';
import { PageLinks } from '@/components/admin/security/page-links';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { AUDIT_LOGS_PATH, AUDITED_ENTITY_TYPES } from '@/config/staff';
import { securityCopy } from '@/lib/copy/security';
import { parseAuditFilter, type AuditFilter } from '@/lib/validations/security';
import { requireDashboardStaff } from '@/server/auth/session';
import { listAuditActors, listAuditLogs } from '@/server/services/security-service';
import type { AuditActorOption } from '@/types/security';

const text = securityCopy.audit;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function filterFields(filter: AuditFilter, actors: readonly AuditActorOption[]): FilterField[] {
  return [
    {
      kind: 'select',
      name: 'entity',
      label: text.entityType,
      value: filter.entity,
      options: AUDITED_ENTITY_TYPES.map((value) => ({ value, label: value })),
    },
    {
      kind: 'select',
      name: 'actor',
      label: text.actor,
      value: filter.actor,
      options: actors.map((actor) => ({ value: actor.id, label: actor.name })),
    },
    { kind: 'date', name: 'from', label: text.from, value: filter.from },
    { kind: 'date', name: 'to', label: text.to, value: filter.to },
    // A per-user trail from /dashboard/users keeps its record while the other filters change.
    { kind: 'hidden', name: 'entityId', value: filter.entityId },
  ];
}

function filterParams(filter: AuditFilter): Record<string, string | undefined> {
  return {
    entity: filter.entity,
    entityId: filter.entityId,
    actor: filter.actor,
    from: filter.from,
    to: filter.to,
  };
}

function SuperadminOnly() {
  return (
    <>
      <DashboardPageHeader title={text.title} />
      <FormAlert tone="info">{securityCopy.onlySuper}</FormAlert>
    </>
  );
}

// Task P4.10.02 (AUD-02): the superadmin reads audit_logs at AAL2 (audit_logs_super_read and the AAL2 policy), newest
// first, filtered by table, record, actor and dates in Asia/Jakarta.
export default async function AuditLogsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  if (ctx.role !== 'superadmin') return <SuperadminOnly />;
  const filter = parseAuditFilter(await searchParams);
  const [logs, actors] = await Promise.all([listAuditLogs(filter), listAuditActors()]);
  const names = new Map(actors.map((actor) => [actor.id, actor.name]));
  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} />
      <div className="space-y-4">
        <FilterBar fields={filterFields(filter, actors)} resetHref={AUDIT_LOGS_PATH} />
        <AuditLogList entries={logs.rows} names={names} />
        <PageLinks
          basePath={AUDIT_LOGS_PATH}
          params={filterParams(filter)}
          page={logs.page}
          hasNext={logs.hasNext}
        />
      </div>
    </>
  );
}
