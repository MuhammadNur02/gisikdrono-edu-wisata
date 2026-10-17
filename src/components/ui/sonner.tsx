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
      // The tokens are bare HSL triplets, so they need hsl() before sonner can use them as colours.
      style={
        {
          '--normal-bg': 'hsl(var(--popover))',
          '--normal-text': 'hsl(var(--popover-foreground))',
          '--normal-border': 'hsl(var(--border))',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
