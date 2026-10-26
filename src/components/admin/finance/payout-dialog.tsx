'use client';

import { HandCoins } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import type { Option } from '@/components/admin/finance/option-select';
import { PayoutForm } from '@/components/admin/finance/payout-form';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { financeCopy } from '@/lib/copy/finance';
import { formatIDR } from '@/lib/utils/currency';
import { withStepUp } from '@/lib/utils/step-up';
import type { ActionResult } from '@/types/action-result';
import type { PayoutBatch } from '@/types/finance';

const text = financeCopy.payouts;

export interface PayoutDialogProps {
  parties: readonly Option[];
  today: string;
  periodStart: string;
  settleAction: (values: unknown) => Promise<ActionResult<PayoutBatch>>;
  stepUpAction: (values: unknown) => Promise<ActionResult<null>>;
}

// Task P4.7.02: "Catat pembayaran" opens the payout form; the code is checked first (docs/Security.md §5.3).
export function PayoutDialog({ settleAction, stepUpAction, ...form }: PayoutDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={() => {
          setIsOpen(true);
        }}
      >
        <HandCoins aria-hidden />
        {text.record}
      </Button>
      <ResponsiveDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title={text.dialogTitle}
        description={text.dialogDescription}
        size="form"
      >
        {isOpen ? (
          <PayoutForm
            {...form}
            submit={withStepUp(stepUpAction, settleAction)}
            onDone={(batch) => {
              toast.success(text.saved(formatIDR(batch.totalAmount)));
              setIsOpen(false);
              router.refresh();
            }}
          />
        ) : null}
      </ResponsiveDialog>
    </>
  );
}
