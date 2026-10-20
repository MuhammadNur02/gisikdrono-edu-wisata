'use client';

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
import type { ActionResult } from '@/types/action-result';

const text = copy.cms.common;

export interface RemoveButtonProps {
  id: string;
  // `Item galeri`, `Titik aktivitas`: what is removed, in the title and the toast.
  noun: string;
  // The row's own name, so the confirmation says which one.
  name: string;
  action: (input: unknown) => Promise<ActionResult<null>>;
}

// docs/StyleGuide.md §5.3: a destructive step is confirmed in an AlertDialog that names the consequence.
export function RemoveButton({ id, noun, name, action }: RemoveButtonProps) {
  const router = useRouter();
  const [isRemoving, startTransition] = useTransition();
  const remove = () => {
    startTransition(async () => {
      const result = await action({ id });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(text.removed(`${noun} "${name}"`));
      router.refresh();
    });
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" loading={isRemoving}>
          {text.remove}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{text.removeTitle(`${noun.toLowerCase()} "${name}"`)}</AlertDialogTitle>
          <AlertDialogDescription>{text.removeConsequence}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{text.cancel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={remove}>
            {text.remove}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
