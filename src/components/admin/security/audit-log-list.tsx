import { ScrollText } from 'lucide-react';

import { EmptyState } from '@/components/admin/shell/empty-state';
import { rwLabel } from '@/config/rw';
import { securityCopy } from '@/lib/copy/security';
import { formatDateTimeShort } from '@/lib/utils/dates';
import type { AuditChange, AuditLogEntry } from '@/types/security';

const text = securityCopy.audit;
// audit_logs_actor_ok names six roles; one added later shows as it is stored.
const ACTOR_ROLES: Readonly<Record<string, string>> = text.actorRoles;

function actorOf(entry: AuditLogEntry, names: ReadonlyMap<string, string>): string {
  const role = ACTOR_ROLES[entry.actorRole] ?? entry.actorRole;
  if (entry.actorId === null) return role;
  return `${names.get(entry.actorId) ?? text.unknownActor} (${role})`;
}

function ChangeTable({ changes }: { changes: readonly AuditChange[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-caption">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th scope="col" className="py-1 pr-3 font-medium">
              {text.column}
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              {text.before}
            </th>
            <th scope="col" className="py-1 font-medium">
              {text.after}
            </th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.column} className="border-t border-border align-top">
              <th scope="row" className="py-1 pr-3 font-mono font-normal">
                {change.column}
              </th>
              <td className="py-1 pr-3 break-all">{change.before ?? text.emptyValue}</td>
              <td className="py-1 break-all">{change.after ?? text.emptyValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditItem({ entry, names }: { entry: AuditLogEntry; names: ReadonlyMap<string, string> }) {
  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-mono text-body-sm font-medium break-all">{entry.action}</p>
        <time dateTime={entry.occurredAt} className="text-caption text-muted-foreground">
          {formatDateTimeShort(entry.occurredAt)}
        </time>
      </div>
      <p className="text-caption break-all text-muted-foreground">
        {text.actor}: {actorOf(entry, names)} · {text.entity}: {entry.entityType}
        {entry.entityId ? ` ${entry.entityId}` : null}
        {entry.rwId === null ? null : ` · ${rwLabel(entry.rwId)}`}
      </p>
      {entry.changes.length === 0 ? (
        <p className="text-caption text-muted-foreground">{text.noChanges}</p>
      ) : (
        <details className="rounded-lg border border-border px-3 py-2">
          <summary className="min-h-11 cursor-pointer content-center text-body-sm">
            {text.showChanges(entry.changes.length)}
          </summary>
          <ChangeTable changes={entry.changes} />
        </details>
      )}
    </li>
  );
}

// Task P4.10.02 (AUD-02): the audit log newest first. Each entry's changes open in place, with no script; a private
// column shows its name and a dash, because the database never copied its value.
export function AuditLogList({
  entries,
  names,
}: {
  entries: readonly AuditLogEntry[];
  names: ReadonlyMap<string, string>;
}) {
  if (entries.length === 0) {
    return <EmptyState icon={ScrollText} title={text.empty} description={text.emptyHint} />;
  }
  return (
    <section aria-label={text.caption} className="rounded-xl border border-border px-4">
      <ul className="divide-y divide-border">
        {entries.map((entry) => (
          <AuditItem key={entry.id} entry={entry} names={names} />
        ))}
      </ul>
    </section>
  );
}
