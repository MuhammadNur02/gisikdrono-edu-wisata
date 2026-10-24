'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm, type Control } from 'react-hook-form';
import { toast } from 'sonner';

import { CheckboxField, SelectField, TextField } from '@/components/admin/cms/fields';
import type { ModerateAction } from '@/components/admin/reviews/review-board';
import { FormAlert } from '@/components/forms/form-alert';
import { PostForm } from '@/components/forms/post-form';
import { RatingStars } from '@/components/reviews/rating-stars';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { REVIEW_LIMITS } from '@/config/reviews';
import { rwLabel } from '@/config/rw';
import { REVIEW_STATUS } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { useActionForm } from '@/hooks/use-action-form';
import { reviewsCopy } from '@/lib/copy/reviews';
import { formatDateShort, formatDateTimeShort } from '@/lib/utils/dates';
import {
  moderateReviewSchema,
  type ModerateReviewInput,
  type ModerateReviewValues,
} from '@/lib/validations/review';
import type { ReviewAdmin } from '@/types/review';

const text = reviewsCopy.moderation;
const FIELDS = ['status', 'isFeatured', 'moderationNote'] as const;

type ModerationControl = Control<ModerateReviewInput, unknown, ModerateReviewValues>;
const STATUS_OPTIONS = DB_ENUMS.review_status.map((status) => ({
  value: status,
  label: REVIEW_STATUS[status].label,
}));

export interface ModerationDialogProps {
  review: ReviewAdmin;
  // null for an RW admin: the dialog then shows the review and nothing to change.
  moderateAction: ModerateAction | null;
  onClose: () => void;
}

// The review as the visitor sent it, under the name the public would see (never reviewer_name).
function ReviewDetails({ review }: { review: ReviewAdmin }) {
  const byline = [
    review.publicReviewerName,
    review.institutionName,
    formatDateShort(review.createdAt),
  ]
    .filter((part) => part !== null)
    .join(' · ');
  return (
    <section className="space-y-3">
      <RatingStars rating={review.rating} />
      {review.title ? <h3 className="text-h4">{review.title}</h3> : null}
      <p className="text-body whitespace-pre-line">{review.body}</p>
      <p className="text-body-sm text-muted-foreground">{byline}</p>
      <p className="text-body-sm text-muted-foreground">{review.rwIds.map(rwLabel).join(', ')}</p>
      {review.moderatedAt ? (
        <p className="text-caption text-muted-foreground">
          {text.moderatedAt(formatDateTimeShort(review.moderatedAt))}
        </p>
      ) : null}
    </section>
  );
}

function defaultsOf(review: ReviewAdmin): ModerateReviewInput {
  return {
    id: review.id,
    status: review.status,
    isFeatured: review.isFeatured,
    moderationNote: review.moderationNote ?? '',
  };
}

function ModerationFields({ control }: { control: ModerationControl }) {
  return (
    <>
      <SelectField
        control={control}
        name="status"
        label={text.status}
        options={STATUS_OPTIONS}
        required
      />
      <CheckboxField
        control={control}
        name="isFeatured"
        label={text.isFeatured}
        description={text.isFeaturedHint}
      />
      <TextField
        control={control}
        name="moderationNote"
        label={text.moderationNote}
        description={text.moderationNoteHint}
        maxLength={REVIEW_LIMITS.moderationNote}
        multiline
      />
    </>
  );
}

function ModerationForm({
  review,
  action,
  onSaved,
}: {
  review: ReviewAdmin;
  action: ModerateAction;
  onSaved: () => void;
}) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(moderateReviewSchema),
    defaultValues: defaultsOf(review),
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: FIELDS,
    onSuccess: () => {
      toast.success(text.saved);
      onSaved();
      router.refresh();
    },
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <ModerationFields control={form.control} />
        <Button type="submit" className="min-h-11" loading={form.formState.isSubmitting}>
          {text.save}
        </Button>
      </PostForm>
    </Form>
  );
}

// Task P4.3.07: one review in a ResponsiveDialog (Dialog from md up, Drawer below it); the superadmin's copy carries
// the moderation form over the column grant (status, is_featured, moderation_note).
export function ModerationDialog({ review, moderateAction, onClose }: ModerationDialogProps) {
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={moderateAction ? text.moderate : text.dialogTitle}
      description={text.dialogDescription}
      size="form"
    >
      <div className="space-y-6 pb-4">
        <ReviewDetails review={review} />
        {moderateAction ? (
          <ModerationForm review={review} action={moderateAction} onSaved={onClose} />
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
