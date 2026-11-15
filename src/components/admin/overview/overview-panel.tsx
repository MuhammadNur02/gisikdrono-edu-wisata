import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export interface OverviewPanelProps {
  title: string;
  description?: string | undefined;
  // A link on the right of the heading (`Buka kehadiran`).
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

// One panel of the overview (Dasbor Gelap): the card surface, a heading row with a quiet link, then its content under a
// hairline. A region named by its heading, so a screen reader can jump between the panels.
export function OverviewPanel({
  title,
  description,
  action,
  className,
  children,
}: OverviewPanelProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn('flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card', className)}
    >
      <div className="flex items-start justify-between gap-4 px-4 py-4 md:px-5">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={headingId} className="text-body-md font-bold text-foreground">
            {title}
          </h2>
          {description ? <p className="text-caption text-muted-foreground">{description}</p> : null}
        </div>
        {action ? (
          <div className="shrink-0 text-caption font-medium text-ink-2 [&_a]:rounded-sm [&_a]:outline-none [&_a]:hover:text-foreground [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-ring">
            {action}
          </div>
        ) : null}
      </div>
      <div className="flex-1 border-t">{children}</div>
    </section>
  );
}
