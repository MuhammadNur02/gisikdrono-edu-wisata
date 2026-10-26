'use client';

import type { BankAccountActions } from '@/components/admin/bank-accounts/bank-account-forms';
import { BankAccountPanel } from '@/components/admin/bank-accounts/bank-account-panel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { bankAccountsCopy } from '@/lib/copy/bank-accounts';
import type { RwTreasuryAccount } from '@/types/bank-account';

const text = bankAccountsCopy;

// Task P4.3.06 on /dashboard/settings: every RW's treasury account, masked, each with its own reveal and change. A
// change raises the high alert payout_account_changed (20261104120000); site_settings
// finance.expected_payout_account_masked is the kelurahan's own and is not touched here.
export function RwTreasuries({
  treasuries,
  actions,
}: {
  treasuries: readonly RwTreasuryAccount[];
  actions: BankAccountActions;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h4">{text.rwTitle}</CardTitle>
        <CardDescription>{text.rwDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {treasuries.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{text.rwEmpty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {treasuries.map((treasury) => (
              <li key={treasury.rwId} className="space-y-3 py-4 first:pt-0 last:pb-0">
                <h3 className="text-body font-semibold">{treasury.rwName}</h3>
                {treasury.account === null ? (
                  <p className="text-body-sm text-muted-foreground">
                    <span className="font-medium">{text.unavailable}</span>. {text.unavailableHint}
                  </p>
                ) : (
                  <BankAccountPanel
                    target={{ kind: 'rw', rwId: treasury.rwId }}
                    initial={treasury.account}
                    actions={actions}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
