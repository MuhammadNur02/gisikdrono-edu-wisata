'use client';

import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy/id';
import { monthLabel } from '@/lib/utils/sessions';
import type { ActionResult } from '@/types/action-result';

const text = copy.sessions.generate;

export interface GenerateDialogProps {
  // `YYYY-MM`, the month on screen.
  month: string;
  activeTemplates: number;
  // generateVisitSessionsAction, handed in by the page.
  action: (input: unknown) => Promise<ActionResult<number>>;
}

// Runs the action for the month and reports how many sessions it created.
function useGenerate(month: string, action: GenerateDialogProps['action']) {
  const router = useRouter();
  const [isRunning, startTransition] = useTransition();
  const run = () => {
    startTransition(async () => {
      const result = await action({ month });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(text.done(result.data));
      router.refresh();
    });
  };
  return { isRunning, run };
}

// docs/StyleGuide.md §6.8: `Buat dari pola mingguan` runs generate_visit_sessions for the month after an AlertDialog
// that says what it will do.
export function GenerateDialog({ month, activeTemplates, action }: GenerateDialogProps) {
  const { isRunning, run } = useGenerate(month, action);
  const hasTemplates = activeTemplates > 0;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" loading={isRunning} disabled={!hasTemplates}>
          <Sparkles aria-hidden />
          {text.open}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{text.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {hasTemplates ? text.description(monthLabel(month), activeTemplates) : text.noTemplates}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{copy.cms.common.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={run} disabled={!hasTemplates}>
            {text.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
