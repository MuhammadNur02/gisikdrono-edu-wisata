'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { ExportForm, type ExportFormProps } from '@/components/admin/exports/export-form';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { exportsCopy as text } from '@/lib/copy/exports';
import type { CreatedExport } from '@/types/export';

export interface ExportDialogProps extends Omit<ExportFormProps, 'onCreated'> {
  onClose: () => void;
}

// The new-export dialog (Task P4.6.03), loaded on the first click. A created export downloads at once through its
// 300-second link, which lives only in this call and the browser's navigation; the history then shows it.
export function ExportDialog({ onClose, ...formProps }: ExportDialogProps) {
  const router = useRouter();
  const onCreated = (created: CreatedExport) => {
    toast.success(text.started(created.rowCount));
    window.location.assign(created.url);
    onClose();
    router.refresh();
  };
  return (
    <ResponsiveDialog
      open
      size="form"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={text.dialogTitle}
      description={text.dialogDescription}
    >
      <ExportForm {...formProps} onCreated={onCreated} />
    </ResponsiveDialog>
  );
}
