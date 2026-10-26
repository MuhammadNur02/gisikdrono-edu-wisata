'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { TotpCodeField } from '@/components/auth/totp-code-field';
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
import { staffCopy } from '@/lib/copy/staff';
import { withStepUp } from '@/lib/utils/step-up';
import { revokeTicketFormSchema } from '@/lib/validations/booking-admin';
import type { ActionResult } from '@/types/action-result';

const text = bookingsAdminCopy.detail;

export type RevokeTicketAction = (values: unknown) => Promise<ActionResult<null>>;

export interface RevokeTicketDialogProps {
  bookingId: string;
  ticketCode: string;
  action: RevokeTicketAction;
  // verifyStaffTotpAction: the code is checked first, so revoke_ticket sees a fresh one (docs/Security.md §5.3).
  stepUpAction: RevokeTicketAction;
  onClose: () => void;
}

// The code is checked by stepUpAction first, then the revocation runs; on success the booking is read again.
function useRevokeTicketForm({
  bookingId,
  ticketCode,
  action,
  stepUpAction,
  onClose,
}: RevokeTicketDialogProps) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(revokeTicketFormSchema),
    defaultValues: { bookingId, ticketCode, reason: '', code: '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action: withStepUp(stepUpAction, action),
    fields: ['reason', 'code'],
    onSuccess: () => {
      toast.success(text.ticketRevoked(ticketCode));
      onClose();
      router.refresh();
    },
  });
  return { form, submit, failure };
}

function RevokeTicketForm(props: RevokeTicketDialogProps) {
  const { form, submit, failure } = useRevokeTicketForm(props);
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="reason"
          label={bookingsAdminCopy.contact.reason}
          description={text.revokeTicketReasonHint}
          required
          render={(field) => <Textarea {...field} rows={3} maxLength={REVEAL_REASON_LIMITS.max} />}
        />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <Button
          type="submit"
          variant="destructive"
          className="min-h-11 w-full"
          loading={form.formState.isSubmitting}
        >
          {text.revokeTicket}
        </Button>
      </PostForm>
    </Form>
  );
}

// docs/StyleGuide.md §5.3: a destructive step names its consequence and asks for its reason before it runs.
export function RevokeTicketDialog(props: RevokeTicketDialogProps) {
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      title={text.revokeTicketTitle(props.ticketCode)}
      description={text.revokeTicketDescription}
      size="form"
    >
      <div className="pb-4">
        <RevokeTicketForm {...props} />
      </div>
    </ResponsiveDialog>
  );
}
