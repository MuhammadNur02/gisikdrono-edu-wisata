'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { ResolveForm } from '@/components/admin/finance/resolve-form';
import { CodeConfirmForm } from '@/components/admin/staff/code-confirm-form';
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

interface DialogButtonProps {
  label: string;
  icon?: ReactNode;
  variant?: 'outline';
  title: string;
  description: string;
  children: (close: () => void) => ReactNode;
}

// A button that opens its dialog; the form inside gets the way to close it.
function DialogButton({ label, icon, variant, title, description, children }: DialogButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const open = () => {
    setIsOpen(true);
  };
  return (
    <>
      <Button type="button" size="sm" variant={variant} onClick={open}>
        {icon}
        {label}
      </Button>
      <ResponsiveDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title={title}
        description={description}
        size="form"
      >
        {isOpen
          ? children(() => {
              setIsOpen(false);
            })
          : null}
      </ResponsiveDialog>
    </>
  );
}

// Review of PR #80, L-7: asking Midtrans again needs the authenticator code, and the server lets it happen once a
// minute per payment.
function RecheckButton({
  paymentId,
  recheckAction,
  stepUpAction,
}: Pick<IssueActionsProps, 'recheckAction' | 'stepUpAction'> & { paymentId: string }) {
  const outcome = useRef<RecheckOutcome['result']>('unchanged');
  const router = useRouter();
  const recheck = async () => {
    const answer = await recheckAction({ paymentId });
    if (answer.ok) outcome.current = answer.data.result;
    return answer.ok ? { ok: true as const, data: null } : answer;
  };
  return (
    <DialogButton
      label={text.recheck}
      icon={<RefreshCw aria-hidden />}
      variant="outline"
      title={text.recheckTitle}
      description={text.recheckDescription}
    >
      {(close) => (
        <CodeConfirmForm
          submitLabel={text.recheck}
          isDestructive={false}
          submit={withStepUp(stepUpAction, recheck)}
          onDone={() => {
            toast.success(text.rechecked[outcome.current]);
            close();
            router.refresh();
          }}
        />
      )}
    </DialogButton>
  );
}

// Task P4.7.04: an open issue's two steps, asking Midtrans again about its payment (which applies only what the Status
// API says about that order) and closing it with a note, each behind the authenticator code.
export function IssueActions({
  issueId,
  paymentId,
  resolveAction,
  recheckAction,
  stepUpAction,
}: IssueActionsProps) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {paymentId ? (
        <RecheckButton
          paymentId={paymentId}
          recheckAction={recheckAction}
          stepUpAction={stepUpAction}
        />
      ) : null}
      <DialogButton
        label={text.resolve}
        title={text.resolveTitle}
        description={text.resolveDescription}
      >
        {(close) => (
          <ResolveForm
            issueId={issueId}
            submit={withStepUp(stepUpAction, resolveAction)}
            onDone={() => {
              toast.success(text.resolved);
              close();
              router.refresh();
            }}
          />
        )}
      </DialogButton>
    </div>
  );
}
