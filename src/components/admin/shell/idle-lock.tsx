'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { SignOutButton } from '@/components/auth/sign-out-button';
import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { IDLE_CHECK_MS, IDLE_LOCK_MS } from '@/config/dashboard';
import { useActionForm } from '@/hooks/use-action-form';
import { copy } from '@/lib/copy/id';
import { readPersistedLock, setDashboardLocked } from '@/lib/utils/idle-lock';
import { stepUpSchema } from '@/lib/validations/step-up';
import type { ActionResult } from '@/types/action-result';

const text = copy.dashboard.idleLock;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;

// Locks after IDLE_LOCK_MS without a pointer or a key, or at once when the tab was locked before a reload; the clock
// restarts on unlock. The document, the shell's inert attribute and sessionStorage follow the state.
function useIdleLock(): { isLocked: boolean; unlock: () => void } {
  const [isLocked, setIsLocked] = useState(false);
  const lastActivity = useRef(Date.now());
  useEffect(() => {
    if (readPersistedLock()) setIsLocked(true);
  }, []);
  useEffect(() => {
    setDashboardLocked(isLocked);
    if (isLocked) return;
    const touch = () => {
      lastActivity.current = Date.now();
    };
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, touch, { passive: true });
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= IDLE_LOCK_MS) setIsLocked(true);
    }, IDLE_CHECK_MS);
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, touch);
      window.clearInterval(timer);
    };
  }, [isLocked]);
  const unlock = () => {
    lastActivity.current = Date.now();
    setIsLocked(false);
  };
  return { isLocked, unlock };
}

function UnlockForm({
  action,
  onUnlocked,
}: {
  action: IdleLockProps['action'];
  onUnlocked: () => void;
}) {
  const form = useForm({ resolver: zodResolver(stepUpSchema), defaultValues: { code: '' } });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['code'],
    onSuccess: onUnlocked,
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <TotpCodeField control={form.control} name="code" autoFocus />
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {text.unlock}
        </Button>
      </PostForm>
    </Form>
  );
}

export interface IdleLockProps {
  // verifyStaffTotpAction, handed in by the layout.
  action: (values: unknown) => Promise<ActionResult<null>>;
}

// docs/Security.md AUTH-11: after ten idle minutes the dashboard hides itself behind a modal dialog on its own layer,
// above any sheet or dialog that was open, until the staff member types a code from their authenticator (which also
// counts as a fresh step-up) or signs out. The shell is inert meanwhile, Escape and clicks outside do nothing, and a
// reload comes back locked. The server's own idle timeout still ends the session underneath.
export function IdleLock({ action }: IdleLockProps) {
  const { isLocked, unlock } = useIdleLock();
  return (
    <Dialog open={isLocked}>
      <DialogContent
        showCloseButton={false}
        className="z-60 sm:max-w-sm"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
      >
        <DialogHeader className="items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Lock aria-hidden className="size-6 text-muted-foreground" />
          </span>
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>{text.description}</DialogDescription>
        </DialogHeader>
        <UnlockForm action={action} onUnlocked={unlock} />
        <SignOutButton variant="ghost" />
      </DialogContent>
    </Dialog>
  );
}
