'use client';

import { Unlink } from 'lucide-react';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/types/action-result';

export interface RevokeLinksButtonProps {
  bookingCode: string;
  action: (input: unknown) => Promise<ActionResult<null>>;
  // Where the visitor asks for a new link, since this page closes with the links.
  afterPath: string;
  // Labels come from the server component that renders this island, so it ships no copy file.
  labels: { open: string; title: string; body: string; confirm: string; keep: string };
}

function useRevoke({ bookingCode, action, afterPath }: RevokeLinksButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const revoke = () => {
    setError(null);
    startTransition(async () => {
      const result = await action({ bookingCode });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      window.location.assign(afterPath);
    });
  };
  return { error, isPending, revoke };
}

// docs/Security.md §6.7 "Cabut tautan": every link of the booking stops working, this browser's included.
export function RevokeLinksButton(props: RevokeLinksButtonProps) {
  const { labels } = props;
  const { error, isPending, revoke } = useRevoke(props);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="-ml-3 px-3 text-ink-2">
          <Unlink aria-hidden />
          {labels.open}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{labels.title}</AlertDialogTitle>
          <AlertDialogDescription>{labels.body}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FormAlert tone="danger">{error}</FormAlert>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{labels.keep}</AlertDialogCancel>
          <Button variant="destructive" loading={isPending} onClick={revoke}>
            {labels.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
