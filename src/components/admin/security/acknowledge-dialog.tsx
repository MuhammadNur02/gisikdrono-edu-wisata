'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { CodeConfirmForm } from '@/components/admin/staff/code-confirm-form';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { securityCopy } from '@/lib/copy/security';
import { withStepUp } from '@/lib/utils/step-up';
import type { ActionResult } from '@/types/action-result';

type FormAction = (values: unknown) => Promise<ActionResult<null>>;

export interface AcknowledgeDialogProps {
  alertId: string;
  acknowledgeAction: FormAction;
  stepUpAction: FormAction;
  onClose: () => void;
}

const text = securityCopy.alerts;

// Task P4.10.02: acknowledging asks for the authenticator code (docs/Security.md §5.3), checked first by
// verifyStaffTotpAction; the database stamps the moment and the superadmin's name.
export function AcknowledgeDialog({
  alertId,
  acknowledgeAction,
  stepUpAction,
  onClose,
}: AcknowledgeDialogProps) {
  const router = useRouter();
  const run = () => acknowledgeAction({ alertId });
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={text.acknowledgeTitle}
      description={text.acknowledgeDescription}
      size="form"
    >
      <CodeConfirmForm
        submitLabel={text.acknowledge}
        isDestructive={false}
        submit={withStepUp(stepUpAction, run)}
        onDone={() => {
          toast.success(text.acknowledged);
          onClose();
          router.refresh();
        }}
      />
    </ResponsiveDialog>
  );
}
