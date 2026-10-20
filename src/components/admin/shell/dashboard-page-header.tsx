import type { ReactNode } from 'react';

export interface DashboardPageHeaderProps {
  title: string;
  description?: string;
  // The page's one primary action, on the right from sm up.
  action?: ReactNode;
}

// docs/StyleGuide.md §6.1 page frame: the title in the display face, a line of description, the primary action.
export function DashboardPageHeader({ title, description, action }: DashboardPageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-h1 text-balance">{title}</h1>
        {description ? (
          <p className="text-body-sm text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
