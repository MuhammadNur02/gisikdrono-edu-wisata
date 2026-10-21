'use client';

import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';

export interface FormDialogProps {
  // The button that opens the dialog: the page's primary action, or `Ubah` on a row.
  trigger: { label: string; variant?: 'default' | 'ghost'; size?: 'default' | 'sm' };
  title: string;
  description?: string;
  // The form, told how to close the dialog once it has saved.
  children: (close: () => void) => ReactNode;
}

// docs/StyleGuide.md §5.3: a create or edit form in a Dialog from md up and a Drawer below it. The form mounts only while
// the dialog is open, so each opening starts from the row as it is now (and a new item from a fresh row id).
export function FormDialog({ trigger, title, description, children }: FormDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={trigger.variant ?? 'default'}
        size={trigger.size ?? 'default'}
        onClick={() => {
          setOpen(true);
        }}
      >
        {trigger.label}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        size="form"
      >
        {open
          ? children(() => {
              setOpen(false);
            })
          : null}
      </ResponsiveDialog>
    </>
  );
}
