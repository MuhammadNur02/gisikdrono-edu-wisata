'use client';

import { createContext, useContext } from 'react';

// The state the shadcn Sidebar shares with its parts (docs/StyleGuide.md §6.1). The context lives here because a
// component file exports PascalCase names only; the primitive in src/components/ui/sidebar.tsx provides it.
export interface SidebarContextValue {
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  // Below md the sidebar is a sheet; the value is false until the browser has measured the viewport.
  isMobile: boolean;
  toggleSidebar: () => void;
}

export const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used within a SidebarProvider.');
  return context;
}
