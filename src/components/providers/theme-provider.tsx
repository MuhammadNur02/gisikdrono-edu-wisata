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

export function ThemeProvider({ scope, children }: { scope: ThemeScope; children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" disableTransitionOnChange {...THEME_SETTINGS[scope]}>
      {children}
    </NextThemesProvider>
  );
}
