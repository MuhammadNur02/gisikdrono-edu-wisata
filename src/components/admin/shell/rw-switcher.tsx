'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';

import { RW_SCOPE_ALL, type RwScope } from '@/config/dashboard';
import { rwAccentClasses, type RwAccent } from '@/config/rw';
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

interface ScopeOption {
  scope: RwScope;
  label: string;
  // An RW's accent, for its dot; `Semua` has none.
  accent?: RwAccent | null;
}

function ScopeButton(props: {
  option: ScopeOption;
  isChosen: boolean;
  isSaving: boolean;
  onChoose: (scope: RwScope) => void;
}) {
  const { option } = props;
  return (
    <button
      type="button"
      aria-pressed={props.isChosen}
      disabled={props.isSaving}
      onClick={() => {
        props.onChoose(option.scope);
      }}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2.5 text-caption font-medium whitespace-nowrap text-ink-2 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:min-h-7',
        props.isChosen && 'bg-accent text-foreground',
      )}
    >
      {option.accent === undefined ? null : (
        <span
          aria-hidden
          className={cn('size-1.5 rounded-full', rwAccentClasses(option.accent).fill)}
        />
      )}
      {option.label}
    </button>
  );
}

// docs/StyleGuide.md §6.1: the superadmin's `Semua · RW 05 · RW 13 · …`, a row of toggle buttons, each RW with a dot
// in its accent. The layout renders it
// for the superadmin only; the choice lives in the rw_scope cookie and the page re-reads through the server. Setting the
// cookie in setRwScopeAction already makes Next.js render the page and its layouts again in the action's answer, so a
// router.refresh() on top only rendered the dashboard a second time inside the same transition, which kept the
// buttons disabled for twice as long and could leave the transition pending (e2e staff-sign-in, review of PR #58).
export function RwSwitcher({ scope, rws, action }: RwSwitcherProps) {
  const options: ScopeOption[] = [
    { scope: RW_SCOPE_ALL, label: text.all },
    ...rws.map((rw) => ({ scope: rw.id, label: rw.label, accent: rw.accentKey })),
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
      className="inline-flex rounded-md border border-border bg-card p-0.5"
    >
      {options.map((option) => (
        <ScopeButton
          key={option.scope}
          option={option}
          isChosen={option.scope === scope}
          isSaving={isSaving}
          onChoose={choose}
        />
      ))}
    </div>
  );
}
