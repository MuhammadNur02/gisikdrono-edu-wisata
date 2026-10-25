'use client';

import { Download } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import type { ExportDialogProps } from '@/components/admin/exports/export-dialog';
import { Button } from '@/components/ui/button';
import { exportsCopy as text } from '@/lib/copy/exports';

// The dialog, its form and the select primitives load on the first click, outside the page's first load (admin budget).
const ExportDialog = dynamic(() =>
  import('@/components/admin/exports/export-dialog').then((module) => module.ExportDialog),
);

export type ExportButtonProps = Omit<ExportDialogProps, 'onClose'>;

export function ExportButton(props: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setIsOpen(true);
        }}
      >
        <Download aria-hidden />
        {text.open}
      </Button>
      {isOpen ? (
        <ExportDialog
          {...props}
          onClose={() => {
            setIsOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
