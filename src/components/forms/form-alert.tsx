import { AlertTriangle, Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

const TONES = {
  // docs/StyleGuide.md §6.9: an action's error message sits in a danger-soft callout above the form.
  danger: { icon: AlertTriangle, className: 'bg-danger-soft text-danger-soft-foreground' },
  info: { icon: Info, className: 'bg-info-soft text-info-soft-foreground' },
} as const;

export interface FormAlertProps {
  tone: keyof typeof TONES;
  children: ReactNode;
  className?: string;
}

// role="alert" for errors so a screen reader reads them out when they appear; a notice is only polite.
export function FormAlert({ tone, children, className }: FormAlertProps) {
  const { icon: Icon, className: toneClassName } = TONES[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-xl p-3 text-body-sm', toneClassName, className)}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
