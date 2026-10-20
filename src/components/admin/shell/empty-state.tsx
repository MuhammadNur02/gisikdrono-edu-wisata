import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  // The one next step, usually the page's primary action.
  action?: ReactNode;
}

// docs/StyleGuide.md §6.9: a dashboard list says why it is empty and what to do next.
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const Icon = icon;
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <span className="rounded-full bg-muted p-3">
        <Icon aria-hidden className="size-6 text-muted-foreground" />
      </span>
      <h2 className="text-h4">{title}</h2>
      <p className="max-w-md text-body-sm text-pretty text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
