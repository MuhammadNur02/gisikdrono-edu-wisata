'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { DASHBOARD_PATH } from '@/config/auth';
import { copy } from '@/lib/copy/id';

export interface ErrorCardProps {
  // Next.js's digest of the server error: a hash support can look up in the logs, never the message or the stack.
  errorCode?: string | undefined;
  onRetry: () => void;
}

// docs/StyleGuide.md §6.9 (Task P4.1.02): the error state of a dashboard segment, inside the shell, with the code
// for support, `Coba lagi` and `Kembali ke dasbor`.
export function ErrorCard({ errorCode, onRetry }: ErrorCardProps) {
  const text = copy.pages.error;
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-card"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft">
        <AlertTriangle aria-hidden className="size-6 text-danger-soft-foreground" />
      </span>
      <div className="space-y-2">
        <h2 className="text-h3">{text.title}</h2>
        <p className="text-body-sm text-pretty text-muted-foreground">{text.description}</p>
        {errorCode ? (
          <p className="text-body-sm text-muted-foreground">
            {text.code}:{' '}
            <span className="font-mono text-foreground tabular-nums select-all">{errorCode}</span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={onRetry}>
          <RotateCcw aria-hidden />
          {text.retry}
        </Button>
        <Button asChild variant="outline">
          <Link href={DASHBOARD_PATH}>{copy.dashboard.error.back}</Link>
        </Button>
      </div>
    </div>
  );
}
