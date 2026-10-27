import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import { EmptyState } from '@/components/admin/shell/empty-state';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { reconciliationCopy } from '@/lib/copy/finance-adjustments';
import { formatDateShort, formatDateTimeShort } from '@/lib/utils/dates';
import type { ReconciliationIssue, ReconciliationRun } from '@/types/finance';

const text = reconciliationCopy;

function ChainBadge({ ok }: { ok: boolean | null }) {
  if (ok === null) return <Badge variant="neutral">{text.chainUnknown}</Badge>;
  return ok ? <Badge variant="success">{text.chainOk}</Badge> : <Badge variant="danger">{text.chainBroken}</Badge>;
}

// Task P4.7.04 (docs/Security.md REC-01): the latest reconciliation runs and what each found.
export function RunsTable({ runs }: { runs: readonly ReconciliationRun[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h4">{text.runsTitle}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {runs.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{text.runsEmpty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{text.runColumns.date}</TableHead>
                <TableHead>{text.runColumns.source}</TableHead>
                <TableHead className="text-right">{text.runColumns.checked}</TableHead>
                <TableHead className="text-right">{text.runColumns.issues}</TableHead>
                <TableHead>{text.runColumns.chains}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="tabular-nums">{formatDateShort(run.runDate)}</TableCell>
                  <TableCell>{text.sources[run.source] ?? run.source}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.paymentsChecked}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.issuesFound}</TableCell>
                  <TableCell className="flex flex-wrap gap-1">
                    <ChainBadge ok={run.auditChainOk} />
                    <ChainBadge ok={run.ledgerChainOk} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export interface IssuesTableProps {
  issues: readonly ReconciliationIssue[];
  actionsFor: (issue: ReconciliationIssue) => ReactNode;
}

function IssueRow({ issue, actions }: { issue: ReconciliationIssue; actions: ReactNode }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap tabular-nums">{formatDateTimeShort(issue.createdAt)}</TableCell>
      <TableCell>{text.issueTypes[issue.issueType] ?? issue.issueType}</TableCell>
      <TableCell>
        <StatusBadge kind="alert_severity" value={issue.severity} />
      </TableCell>
      <TableCell className="font-medium">{issue.bookingCode ?? '–'}</TableCell>
      <TableCell className="tabular-nums">{issue.orderId ?? '–'}</TableCell>
      <TableCell>{actions}</TableCell>
    </TableRow>
  );
}

// Task P4.7.04 (docs/Security.md REC-01, REC-09): the issues still open, newest first, each with its next steps.
export function IssuesTable({ issues, actionsFor }: IssuesTableProps) {
  if (issues.length === 0) {
    return <EmptyState icon={ShieldCheck} title={text.issuesEmpty} description={text.issuesEmptyHint} />;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h4">{text.issuesTitle}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{text.columns.createdAt}</TableHead>
              <TableHead>{text.columns.type}</TableHead>
              <TableHead>{text.columns.severity}</TableHead>
              <TableHead>{text.columns.booking}</TableHead>
              <TableHead>{text.columns.order}</TableHead>
              <TableHead>
                <span className="sr-only">{text.columns.action}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} actions={actionsFor(issue)} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
