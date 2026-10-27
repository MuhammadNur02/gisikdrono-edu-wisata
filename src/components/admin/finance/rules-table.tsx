import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { rwLabel } from '@/config/rw';
import { financeCopy } from '@/lib/copy/finance';
import { formatDateShort } from '@/lib/utils/dates';
import { ruleState, type RuleState } from '@/lib/utils/finance-display';
import type { RevenueRule, RevenueRuleTargets, RuleLine } from '@/types/finance';

const text = financeCopy.rules;

const STATE_BADGES: Record<RuleState, { variant: 'success' | 'info' | 'neutral'; label: string }> = {
  inForce: { variant: 'success', label: text.inForce },
  upcoming: { variant: 'info', label: text.upcoming },
  closed: { variant: 'neutral', label: text.closed },
};

export interface RulesTableProps {
  rules: readonly RevenueRule[];
  targets: RevenueRuleTargets;
  today: string;
}

function targetOf(rule: RevenueRule, targets: RevenueRuleTargets): string {
  if (rule.scope === 'package') return targets.packages.find((item) => item.id === rule.packageId)?.name ?? '–';
  if (rule.scope === 'product') return targets.products.find((item) => item.id === rule.productId)?.name ?? '–';
  return rule.rwId === null ? text.allRws : rwLabel(rule.rwId);
}

function lineLabel(line: RuleLine, targets: RevenueRuleTargets): string {
  const share = `${String(line.pct)} %`;
  if (line.beneficiary === 'umkm_vendor') {
    const vendor = targets.vendors.find((item) => item.id === line.vendorId)?.name ?? financeCopy.parties.unknown;
    return `${financeCopy.parties.vendor(vendor)} ${share}`;
  }
  if (line.beneficiary === 'rw_treasury') {
    const rw = line.rwId === null ? text.placeholders.ownRws : rwLabel(line.rwId);
    return `${financeCopy.parties.rw(rw)} ${share}`;
  }
  return `${financeCopy.parties.kelurahan} ${share}`;
}

function periodOf(rule: RevenueRule): string {
  const from = text.from(formatDateShort(rule.effectiveFrom));
  return rule.effectiveTo ? `${from} ${text.until(formatDateShort(rule.effectiveTo))}` : from;
}

function RuleRow({ rule, targets, today }: { rule: RevenueRule } & Omit<RulesTableProps, 'rules'>) {
  const state = STATE_BADGES[ruleState(rule, today)];
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{rule.name}</p>
        <p className="text-caption text-muted-foreground">
          {text.scopes[rule.scope]} · {targetOf(rule, targets)}
        </p>
      </TableCell>
      <TableCell className="text-body-sm">
        {rule.lines.map((line) => lineLabel(line, targets)).join(' · ')}
      </TableCell>
      <TableCell className="whitespace-nowrap text-body-sm tabular-nums">{periodOf(rule)}</TableCell>
      <TableCell>
        <Badge variant={state.variant}>{state.label}</Badge>
      </TableCell>
    </TableRow>
  );
}

// Task P4.7.02: every version of every rule, newest first, with its shares and the days it is in force; a rule is
// never edited, so its history is this list.
export function RulesTable({ rules, targets, today }: RulesTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h4">{text.listTitle}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rules.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{text.empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{text.fields.name}</TableHead>
                <TableHead>{text.fields.lines}</TableHead>
                <TableHead>{text.fields.effectiveFrom}</TableHead>
                <TableHead>
                  <span className="sr-only">{text.inForce}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <RuleRow key={rule.id} rule={rule} targets={targets} today={today} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
