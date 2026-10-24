'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { copy } from '@/lib/copy/id';
import type { ActionResult } from '@/types/action-result';

export interface ConfirmRequest {
  // The row's Server Action, with the row it is for already bound.
  run: () => Promise<ActionResult<unknown>>;
  title: string;
  // What happens, in the officer's terms (docs/StyleGuide.md §5.3): the consequence, not a question.
  consequence: string;
  confirmLabel: string;
  // Said once it worked.
  done: string;
  // A step that is easy to take back (publishing again) is not shown in red.
  destructive?: boolean;
}

export interface ConfirmActionDialogProps {
  // The step waiting for a yes, or null while nothing is.
  request: ConfirmRequest | null;
  onClose: () => void;
}

function ConfirmFooter({
  request,
  isRunning,
  onCancel,
  onConfirm,
}: {
  request: ConfirmRequest;
  isRunning: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" disabled={isRunning} onClick={onCancel}>
        {copy.cms.common.cancel}
      </Button>
      <Button
        type="button"
        variant={request.destructive === false ? 'default' : 'destructive'}
        loading={isRunning}
        onClick={onConfirm}
      >
        {request.confirmLabel}
      </Button>
    </div>
  );
}

// docs/StyleGuide.md §5.3: a row action that archives or removes something is confirmed in a ResponsiveDialog (a
// Dialog from md up, a Drawer below it) that names the consequence; the Server Action re-checks the scope itself.
export function ConfirmActionDialog({ request, onClose }: ConfirmActionDialogProps) {
  const router = useRouter();
  const [isRunning, startTransition] = useTransition();
  const confirm = (current: ConfirmRequest) => {
    startTransition(async () => {
      const result = await current.run();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(current.done);
      onClose();
      router.refresh();
    });
  };
  return (
    <ResponsiveDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && !isRunning) onClose();
      }}
      title={request?.title ?? ''}
      description={request?.consequence}
      footer={
        request ? (
          <ConfirmFooter
            request={request}
            isRunning={isRunning}
            onCancel={onClose}
            onConfirm={() => {
              confirm(request);
            }}
          />
        ) : null
      }
    >
      {null}
    </ResponsiveDialog>
  );
}
