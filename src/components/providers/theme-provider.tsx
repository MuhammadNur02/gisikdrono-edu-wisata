'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps, ReactNode } from 'react';

type ThemeSettings = Omit<ComponentProps<typeof NextThemesProvider>, 'children'>;

// docs/StyleGuide.md §2.6. The public, booking and auth groups are always light (decision D3), so a staff
// member's dark preference never reaches the public site. The dashboard follows the system and keeps its
// choice under its own storage key.
const THEME_SETTINGS = {
  public: { forcedTheme: 'light', defaultTheme: 'light', enableSystem: false },
  admin: { defaultTheme: 'system', enableSystem: true, storageKey: 'gsk-admin-theme' },
} as const satisfies Record<string, ThemeSettings>;

export type ThemeScope = keyof typeof THEME_SETTINGS;

export interface ThemeProviderProps {
  scope: ThemeScope;
  // The request's CSP nonce on private routes, where next-themes' inline script runs only with it (docs/Security.md
  // §8.2). Public ISR pages have none and allow inline scripts instead.
  nonce?: string | undefined;
  children: ReactNode;
}

export function ThemeProvider({ scope, nonce, children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      disableTransitionOnChange
      nonce={nonce}
      {...THEME_SETTINGS[scope]}
    >
      {children}
    </NextThemesProvider>
  );
}
