'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ResolveForm } from '@/components/admin/finance/resolve-form';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { reconciliationCopy } from '@/lib/copy/finance-adjustments';
import { withStepUp } from '@/lib/utils/step-up';
import type { ActionResult } from '@/types/action-result';
import type { RecheckOutcome } from '@/types/finance';

const text = reconciliationCopy;

export interface IssueActionsProps {
  issueId: string;
  paymentId: string | null;
  resolveAction: (values: unknown) => Promise<ActionResult<null>>;
  recheckAction: (values: unknown) => Promise<ActionResult<RecheckOutcome>>;
  stepUpAction: (values: unknown) => Promise<ActionResult<null>>;
}

function RecheckButton({ paymentId, recheckAction }: Pick<IssueActionsProps, 'recheckAction'> & { paymentId: string }) {
  const [isChecking, startCheck] = useTransition();
  const router = useRouter();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      loading={isChecking}
      onClick={() => {
        startCheck(async () => {
          const answer = await recheckAction({ paymentId });
          if (!answer.ok) {
            toast.error(answer.error.message);
            return;
          }
          toast.success(text.rechecked[answer.data.result]);
          router.refresh();
        });
      }}
    >
      <RefreshCw aria-hidden />
      {text.recheck}
    </Button>
  );
}

// Task P4.7.04: an open issue's two steps, asking Midtrans again about its payment (which applies only what the Status
// API says about that order) and closing it with a note behind the authenticator code.
export function IssueActions({ issueId, paymentId, resolveAction, recheckAction, stepUpAction }: IssueActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {paymentId ? <RecheckButton paymentId={paymentId} recheckAction={recheckAction} /> : null}
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setIsOpen(true);
        }}
      >
        {text.resolve}
      </Button>
      <ResponsiveDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title={text.resolveTitle}
        description={text.resolveDescription}
        size="form"
      >
        {isOpen ? (
          <ResolveForm
            issueId={issueId}
            submit={withStepUp(stepUpAction, resolveAction)}
            onDone={() => {
              toast.success(text.resolved);
              setIsOpen(false);
              router.refresh();
            }}
          />
        ) : null}
      </ResponsiveDialog>
    </div>
  );
}
