'use client';

import { Link2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { reconciliationCopy } from '@/lib/copy/finance-adjustments';
import type { ActionResult } from '@/types/action-result';
import type { ChainStatus } from '@/types/finance';

const text = reconciliationCopy;

// Task P4.7.04 (docs/Security.md REC-09): the audit log and the ledger checked on request through verify_audit_chain,
// six times an hour at most; the answer is said in words, in a live region.
export function ChainCheck({ checkAction }: { checkAction: () => Promise<ActionResult<ChainStatus>> }) {
  const [result, setResult] = useState<string | null>(null);
  const [isChecking, startCheck] = useTransition();
  const check = () => {
    startCheck(async () => {
      const answer = await checkAction();
      if (!answer.ok) {
        toast.error(answer.error.message);
        return;
      }
      const { audit, ledger } = answer.data;
      setResult(text.chainResult(text.chainState(audit.ok, audit.checked), text.chainState(ledger.ok, ledger.checked)));
    });
  };
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle className="text-h4">{text.chainTitle}</CardTitle>
          <CardDescription>{text.chainDescription}</CardDescription>
        </div>
        <Button type="button" variant="outline" className="min-h-11" loading={isChecking} onClick={check}>
          <Link2 aria-hidden />
          {text.chainCheck}
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-body-sm" aria-live="polite">
          {result}
        </p>
      </CardContent>
    </Card>
  );
}
