'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

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
import { revokeTicketSchema } from '@/lib/validations/booking-admin';
import type { ActionResult } from '@/types/action-result';

const text = bookingsAdminCopy.detail;

export type RevokeTicketAction = (values: unknown) => Promise<ActionResult<null>>;

export interface RevokeTicketDialogProps {
  bookingId: string;
  ticketCode: string;
  action: RevokeTicketAction;
  onClose: () => void;
}

function RevokeTicketForm({ bookingId, ticketCode, action, onClose }: RevokeTicketDialogProps) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(revokeTicketSchema),
    defaultValues: { bookingId, ticketCode, reason: '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['reason'],
    onSuccess: () => {
      toast.success(text.ticketRevoked(ticketCode));
      onClose();
      router.refresh();
    },
  });
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
