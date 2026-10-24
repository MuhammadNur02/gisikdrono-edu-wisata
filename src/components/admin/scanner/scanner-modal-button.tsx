'use client';

import { ScanLine } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';

// The modal, its photo reader and the result sheet load on the first tap, outside every page's first load.
const ScannerModal = dynamic(
  () => import('@/components/admin/scanner/scanner-modal').then((module) => module.ScannerModal),
  { ssr: false },
);

export interface ScannerModalButtonProps {
  label: string;
  canOverride: boolean;
  size?: ButtonProps['size'];
  className?: string;
}

// docs/StyleGuide.md §6.6, §6.7: `Scan Tiket` in the topbar from md up and `Scan` in the QuickScannerBar below it open
// the ScannerModal over the page the officer is on.
export function ScannerModalButton({
  label,
  canOverride,
  size,
  className,
}: ScannerModalButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size={size}
        className={className}
        aria-haspopup="dialog"
        onClick={() => {
          setIsOpen(true);
        }}
      >
        <ScanLine aria-hidden />
        {label}
      </Button>
      {isOpen ? (
        <ScannerModal
          canOverride={canOverride}
          onClose={() => {
            setIsOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
