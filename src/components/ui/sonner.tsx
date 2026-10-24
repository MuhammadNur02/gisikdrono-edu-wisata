'use client';

import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { useTheme } from 'next-themes';
import type * as React from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { MEDIA_MD_UP, useMediaQuery } from '@/hooks/use-media-query';

// docs/StyleGuide.md §6.9: success toasts stay 4 s; error toasts pass duration: Infinity at the call site.
const SUCCESS_TOAST_MS = 4000;

const THEMES = ['light', 'dark', 'system'] as const;

function toToasterTheme(theme: string | undefined): ToasterProps['theme'] {
  return THEMES.find((known) => known === theme) ?? 'system';
}

function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  const isDesktop = useMediaQuery(MEDIA_MD_UP);

  return (
    <Sonner
      theme={toToasterTheme(theme)}
      position={isDesktop ? 'bottom-right' : 'top-center'}
      duration={SUCCESS_TOAST_MS}
      className="toaster group"
      icons={{
        success: <CheckCircle2 className="size-4" />,
        info: <Info className="size-4" />,
        warning: <AlertTriangle className="size-4" />,
        error: <XCircle className="size-4" />,
        loading: <Loader2 className="size-4 motion-safe:animate-spin" />,
      }}
      // sonner reads its colours from these variables; the tokens are full colours, so they pass straight through.
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
