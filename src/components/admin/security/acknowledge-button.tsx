'use client';

import { CheckCheck } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import type { AcknowledgeDialogProps } from '@/components/admin/security/acknowledge-dialog';
import { Button } from '@/components/ui/button';
import { securityCopy } from '@/lib/copy/security';

// The dialog and its form load on the first click, outside the page's first load (admin budget).
const AcknowledgeDialog = dynamic(() =>
  import('@/components/admin/security/acknowledge-dialog').then(
    (module) => module.AcknowledgeDialog,
  ),
);

export function AcknowledgeButton({
  title,
  ...props
}: Omit<AcknowledgeDialogProps, 'onClose'> & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
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
        <CheckCheck aria-hidden />
        {securityCopy.alerts.acknowledge}
        <span className="sr-only">: {title}</span>
      </Button>
      {isOpen ? (
        <AcknowledgeDialog
          {...props}
          onClose={() => {
            setIsOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
