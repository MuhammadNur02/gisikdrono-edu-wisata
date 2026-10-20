import type { ReactNode } from 'react';

export interface TopbarProps {
  // The phone menu button; hidden from md up, where the sidebar shows.
  menu: ReactNode;
  // Shown below md only, where the sidebar's context chip is out of sight.
  context: ReactNode;
  // The superadmin's RwSwitcher; nothing for an RW officer.
  actions: ReactNode;
}

// docs/StyleGuide.md §6.1, the basic form of Task P2.8.03: breadcrumb, Scan Tiket, the bell and the avatar menu join
// in Task P4.1.01.
export function Topbar({ menu, context, actions }: TopbarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
      {menu}
      <div className="md:hidden">{context}</div>
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </header>
  );
}
