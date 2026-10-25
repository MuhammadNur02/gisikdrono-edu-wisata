'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { DetailCard } from '@/components/admin/bookings/booking-detail-parts';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { ADMIN_NOTES_MAX_LENGTH } from '@/config/bookings';
import { useActionForm } from '@/hooks/use-action-form';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';
import { adminNotesSchema } from '@/lib/validations/booking-admin';
import type { ActionResult } from '@/types/action-result';

const text = bookingsAdminCopy.detail;

type NotesAction = (values: unknown) => Promise<ActionResult<null>>;

function useAdminNotesForm(bookingId: string, adminNotes: string | null, action: NotesAction) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(adminNotesSchema),
    defaultValues: { bookingId, adminNotes: adminNotes ?? '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['adminNotes'],
    onSuccess: () => {
      toast.success(text.adminNotesSaved);
      router.refresh();
    },
  });
  return { form, submit, failure };
}

// admin_notes, the one column staff write on a booking (0005, bookings_staff_notes).
export function AdminNotesForm({
  bookingId,
  adminNotes,
  action,
}: {
  bookingId: string;
  adminNotes: string | null;
  action: NotesAction;
}) {
  const { form, submit, failure } = useAdminNotesForm(bookingId, adminNotes, action);
  return (
    <DetailCard title={text.adminNotes}>
      <Form {...form}>
        <PostForm onSubmit={submit}>
          {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
          <FormField
            control={form.control}
            name="adminNotes"
            label={text.adminNotes}
            description={text.adminNotesHint}
            render={(field) => <Textarea {...field} rows={4} maxLength={ADMIN_NOTES_MAX_LENGTH} />}
          />
          <Button
            type="submit"
            variant="outline"
            className="min-h-11"
            loading={form.formState.isSubmitting}
          >
            {text.adminNotesSave}
          </Button>
        </PostForm>
      </Form>
    </DetailCard>
  );
}
