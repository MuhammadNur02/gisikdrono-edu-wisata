'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import Link from 'next/link';

import { StatusPage } from '@/components/layout/status-page';
import { Button } from '@/components/ui/button';
import { HOME_NAV_ITEM } from '@/config/nav';
import { copy } from '@/lib/copy/id';

export interface ErrorNoticeProps {
  // Next.js's digest of a server error: a hash, never the message or the stack (docs/Security.md HDR-01).
  errorCode?: string;
  onRetry: () => void;
}

// Shared by error.tsx and global-error.tsx. It never shows the exception text, only the code that
// support can look up in the server logs (docs/StyleGuide.md §6.9).
export function ErrorNotice({ errorCode, onRetry }: ErrorNoticeProps) {
  const text = copy.pages.error;
  return (
    <StatusPage
      icon={AlertTriangle}
      title={text.title}
      description={text.description}
      detail={
        errorCode ? (
          <p className="text-body-sm text-muted-foreground">
            {text.code}:{' '}
            <span className="font-mono text-foreground tabular-nums select-all">{errorCode}</span>
          </p>
        ) : null
      }
      actions={
        <>
          <Button size="lg" onClick={onRetry}>
            <RotateCcw aria-hidden />
            {text.retry}
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={HOME_NAV_ITEM.href}>{text.home}</Link>
          </Button>
        </>
      }
    />
  );
}
