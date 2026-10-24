'use client';

import { Check, CircleAlert, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

// How long the check and "Disalin" stay before the button reads "Salin" again (DESIGN-SPEC §4 Reservasi, copy).
const RESULT_MS = 2400;

type CopyResult = 'idle' | 'copied' | 'failed';

export interface CopyValueButtonProps {
  value: string;
  // Labels come from the server component that renders this island, so it ships no copy file.
  label: string;
  copiedLabel: string;
  failedLabel: string;
  // What is copied, read after the label by screen readers only, such as "nomor Virtual Account".
  what: string;
}

function useCopyResult() {
  const [result, setResult] = useState<CopyResult>('idle');
  useEffect(() => {
    if (result === 'idle') return undefined;
    const timer = setTimeout(() => {
      setResult('idle');
    }, RESULT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [result]);
  const copy = (value: string) => {
    navigator.clipboard.writeText(value).then(
      () => {
        setResult('copied');
      },
      () => {
        setResult('failed');
      },
    );
  };
  return { result, copy };
}

// "Salin" beside a Virtual Account number or an amount: writes the value to the clipboard and answers with a check and
// "Disalin", or "Gagal menyalin" when the browser refuses, for 2.4 s in a polite live region. 44 px on every screen.
export function CopyValueButton({
  value,
  label,
  copiedLabel,
  failedLabel,
  what,
}: CopyValueButtonProps) {
  const { result, copy } = useCopyResult();
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          copy(value);
        }}
      >
        {result === 'copied' ? (
          <Check aria-hidden className="text-success" />
        ) : (
          <Copy aria-hidden />
        )}
        {label}
        <span className="sr-only"> {what}</span>
      </Button>
      <p
        aria-live="polite"
        className={cn(
          'flex min-h-4.5 items-center gap-1 text-caption',
          result === 'failed' ? 'text-destructive' : 'text-success',
        )}
      >
        {result === 'failed' && <CircleAlert aria-hidden className="size-3.5" />}
        {result === 'copied' && copiedLabel}
        {result === 'failed' && failedLabel}
      </p>
    </div>
  );
}
