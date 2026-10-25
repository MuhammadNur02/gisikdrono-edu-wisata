'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { Textarea } from '@/components/ui/textarea';
import { REVEAL_REASON_LIMITS } from '@/config/bookings';
import { useActionForm } from '@/hooks/use-action-form';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';
import { revealContactSchema } from '@/lib/validations/booking-admin';
import type { ActionResult } from '@/types/action-result';
import type { RevealedContact } from '@/types/booking-admin';

const text = bookingsAdminCopy.contact;

export type RevealAction = (values: unknown) => Promise<ActionResult<RevealedContact>>;

export interface RevealContactDialogProps {
  bookingId: string;
  action: RevealAction;
  onRevealed: (contact: RevealedContact) => void;
  onClose: () => void;
}

// The function refuses a booking outside the window with FORBIDDEN, which the officer reads as the window's rule (review
// of PR #75, F-75-6).
async function revealWithWindowMessage(action: RevealAction, values: unknown) {
  const result = await action(values);
  if (result.ok || result.error.code !== 'FORBIDDEN') return result;
  return { ...result, error: { ...result.error, message: text.outsideWindow } };
}

function RevealForm({ bookingId, action, onRevealed }: Omit<RevealContactDialogProps, 'onClose'>) {
  const form = useForm({
    resolver: zodResolver(revealContactSchema),
    defaultValues: { bookingId, reason: '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action: (values) => revealWithWindowMessage(action, values),
    fields: ['reason'],
    onSuccess: onRevealed,
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="reason"
          label={text.reason}
          description={text.reasonHint}
          required
          render={(field) => <Textarea {...field} rows={3} maxLength={REVEAL_REASON_LIMITS.max} />}
        />
        <Button type="submit" className="min-h-11 w-full" loading={form.formState.isSubmitting}>
          {text.revealSubmit}
        </Button>
      </PostForm>
    </Form>
  );
}

// docs/StyleGuide.md §6.10: the reason first, then rpc_reveal_booking_contact, which records the reveal and counts it
// against the daily cap.
export function RevealContactDialog({ onClose, ...props }: RevealContactDialogProps) {
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={text.revealTitle}
      description={text.revealDescription}
      size="form"
    >
      <div className="pb-4">
        <RevealForm {...props} />
      </div>
    </ResponsiveDialog>
  );
}
