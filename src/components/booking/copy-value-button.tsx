'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

// How long the check and "Disalin" stay before the button reads "Salin" again (DESIGN-SPEC §4 Reservasi, copy).
const COPIED_MS = 2400;

export interface CopyValueButtonProps {
  value: string;
  // Labels come from the server component that renders this island, so it ships no copy file.
  label: string;
  copiedLabel: string;
  // What a screen reader hears for the button, such as "Salin nomor virtual account".
  accessibleLabel: string;
}

// "Salin" beside a Virtual Account number or an amount: writes the value to the clipboard and answers with a check and
// "Disalin" for 2.4 s, which a polite live region reads out.
export function CopyValueButton({
  value,
  label,
  copiedLabel,
  accessibleLabel,
}: CopyValueButtonProps) {
  const [isCopied, setIsCopied] = useState(false);
  useEffect(() => {
    if (!isCopied) return undefined;
    const timer = setTimeout(() => {
      setIsCopied(false);
    }, COPIED_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [isCopied]);
  const copyValue = () => {
    navigator.clipboard.writeText(value).then(
      () => {
        setIsCopied(true);
      },
      () => {
        setIsCopied(false);
      },
    );
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={accessibleLabel}
      onClick={copyValue}
      className="shrink-0"
    >
      {isCopied ? <Check aria-hidden className="text-success" /> : <Copy aria-hidden />}
      <span aria-live="polite">{isCopied ? copiedLabel : label}</span>
    </Button>
  );
}
