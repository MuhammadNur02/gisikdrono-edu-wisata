'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';

import { RW_SCOPE_ALL, type RwScope } from '@/config/dashboard';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import type { ActionResult } from '@/types/action-result';
import type { RwBadge } from '@/types/rw-unit';

const text = copy.dashboard.rwSwitcher;

export interface RwSwitcherProps {
  scope: RwScope;
  // Every RW, offline ones included, in their order.
  rws: readonly RwBadge[];
  // setRwScopeAction, handed in by the layout.
  action: (input: unknown) => Promise<ActionResult<null>>;
}

// docs/StyleGuide.md §6.1: the superadmin's `Semua · RW 05 · RW 08 · …`, a row of toggle buttons. The layout renders it
// for the superadmin only; the choice lives in the rw_scope cookie and the page re-reads through the server. Setting the
// cookie in setRwScopeAction already makes Next.js render the page and its layouts again in the action's answer, so a
// router.refresh() on top only rendered the dashboard a second time inside the same transition, which kept the
// buttons disabled for twice as long and could leave the transition pending (e2e staff-sign-in, review of PR #58).
export function RwSwitcher({ scope, rws, action }: RwSwitcherProps) {
  const options: { scope: RwScope; label: string }[] = [
    { scope: RW_SCOPE_ALL, label: text.all },
    ...rws.map((rw) => ({ scope: rw.id, label: rw.label })),
  ];
  const [isSaving, startTransition] = useTransition();
  const choose = (next: RwScope) => {
    startTransition(async () => {
      const result = await action({ scope: next });
      if (!result.ok) toast.error(result.error.message);
    });
  };
  return (
    <div
      role="group"
      aria-label={text.label}
      className="inline-flex rounded-xl border border-border bg-muted p-1"
    >
      {options.map((option) => (
        <button
          key={option.scope}
          type="button"
          aria-pressed={option.scope === scope}
          disabled={isSaving}
          onClick={() => {
            choose(option.scope);
          }}
          className={cn(
            'min-h-11 rounded-lg px-3 text-body-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:min-h-9',
            option.scope === scope && 'bg-background text-foreground shadow-card',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
