'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import type { Option } from '@/components/admin/finance/option-select';
import { RuleForm } from '@/components/admin/finance/rule-form';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { financeCopy } from '@/lib/copy/finance';
import { withStepUp } from '@/lib/utils/step-up';
import type { ActionResult } from '@/types/action-result';
import type { RevenueRuleTargets, SavedRule } from '@/types/finance';

const text = financeCopy.rules;

export interface RuleDialogProps {
  targets: RevenueRuleTargets;
  rwOptions: readonly Option[];
  today: string;
  saveAction: (values: unknown) => Promise<ActionResult<SavedRule>>;
  stepUpAction: (values: unknown) => Promise<ActionResult<null>>;
}

// Task P4.7.02: "Versi baru" opens the rule form; the authenticator code goes to verifyStaffTotpAction first, then the
// rest to saveRevenueRuleAction (docs/Security.md §5.3). The form mounts only while open, so each opening starts empty.
export function RuleDialog({ saveAction, stepUpAction, ...form }: RuleDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button
        type="button"
        className="min-h-11"
        onClick={() => {
          setIsOpen(true);
        }}
      >
        <Plus aria-hidden />
        {text.newVersion}
      </Button>
      <ResponsiveDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title={text.dialogTitle}
        description={text.dialogDescription}
        size="form"
      >
        {isOpen ? (
          <RuleForm
            {...form}
            submit={withStepUp(stepUpAction, saveAction)}
            onDone={() => {
              toast.success(text.saved);
              setIsOpen(false);
              router.refresh();
            }}
          />
        ) : null}
      </ResponsiveDialog>
    </>
  );
}
