'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm, useWatch, type Control } from 'react-hook-form';

import { CaptchaSubmit } from '@/components/auth/captcha-submit';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { RatingInput } from '@/components/reviews/rating-input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TURNSTILE_ACTIONS } from '@/config/auth';
import { HOME_NAV_ITEM } from '@/config/nav';
import { REVIEW_LIMITS } from '@/config/reviews';
import { useActionForm } from '@/hooks/use-action-form';
import { useTurnstileToken } from '@/hooks/use-turnstile-token';
import { reviewsCopy } from '@/lib/copy/reviews';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import {
  submitReviewSchema,
  type SubmitReviewInput,
  type SubmitReviewValues,
} from '@/lib/validations/review';
import type { ActionResult } from '@/types/action-result';

const text = reviewsCopy.form;
const FIELDS = [
  'rating',
  'title',
  'body',
  'reviewerName',
  'isAnonymous',
  'turnstileToken',
] as const;

type ReviewControl = Control<SubmitReviewInput, unknown, SubmitReviewValues>;
export type SubmitReviewAction = (values: unknown) => Promise<ActionResult<null>>;

export interface ReviewFormProps {
  bookingCode: string;
  submitAction: SubmitReviewAction;
}

function RatingField({ control }: { control: ReviewControl }) {
  return (
    <FormField
      control={control}
      name="rating"
      label={text.rating}
      required
      render={(field) => (
        <RatingInput
          name={field.name}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  );
}

function BodyField({ control }: { control: ReviewControl }) {
  const body = useWatch({ control, name: 'body' });
  return (
    <FormField
      control={control}
      name="body"
      label={text.body}
      description={`${text.bodyHint} ${text.bodyCounter(body.length)}`}
      required
      render={(field) => <Textarea {...field} rows={6} maxLength={REVIEW_LIMITS.bodyMax} />}
    />
  );
}

function NameFields({ control }: { control: ReviewControl }) {
  return (
    <>
      <FormField
        control={control}
        name="reviewerName"
        label={text.reviewerName}
        description={text.reviewerNameHint}
        required
        render={(field) => (
          <Input {...field} autoComplete="given-name" maxLength={REVIEW_LIMITS.reviewerNameMax} />
        )}
      />
      {/* docs/StyleGuide.md §5.10: `Tampilkan nama saya`, the inverse of reviews.is_anonymous. */}
      <FormField
        control={control}
        name="isAnonymous"
        label={text.showName}
        description={text.showNameHint}
        render={(field) => (
          <Checkbox
            ref={field.ref}
            checked={!field.value}
            onBlur={field.onBlur}
            onCheckedChange={(checked) => {
              field.onChange(checked !== true);
            }}
            className="size-6"
          />
        )}
      />
    </>
  );
}

function ReviewFields({ control }: { control: ReviewControl }) {
  return (
    <>
      <RatingField control={control} />
      <FormField
        control={control}
        name="title"
        label={text.titleField}
        render={(field) => (
          <Input {...field} value={field.value ?? ''} maxLength={REVIEW_LIMITS.title} />
        )}
      />
      <BodyField control={control} />
      <NameFields control={control} />
    </>
  );
}

// docs/PRD.md FR-POST-06: one review per booking, so the form gives way to the thank-you once it is sent and offers no
// way to edit it (docs/StyleGuide.md §5.10).
export function ReviewThanks() {
  return (
    <section aria-live="polite" className="space-y-4 text-center">
      <CheckCircle2 aria-hidden className="mx-auto size-12 text-success" />
      <h2 className="text-h3 text-balance">{reviewsCopy.thanks.title}</h2>
      <p className="text-body-sm text-pretty text-muted-foreground">
        {reviewsCopy.thanks.description}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg">
          <Link href={PUBLIC_PATHS.reviews}>{reviewsCopy.thanks.seeReviews}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={HOME_NAV_ITEM.href}>{reviewsCopy.thanks.backHome}</Link>
        </Button>
      </div>
    </section>
  );
}

const EMPTY_REVIEW = {
  rating: 0,
  title: '',
  body: '',
  reviewerName: '',
  isAnonymous: false,
  turnstileToken: '',
};

function useReviewForm(bookingCode: string) {
  return useForm({
    resolver: zodResolver(submitReviewSchema),
    defaultValues: { ...EMPTY_REVIEW, bookingCode },
  });
}

interface OpenReviewFormProps {
  bookingCode: string;
  action: SubmitReviewAction;
  onSent: () => void;
}

function OpenReviewForm({ bookingCode, action, onSent }: OpenReviewFormProps) {
  const form = useReviewForm(bookingCode);
  const captcha = useTurnstileToken((token) => {
    form.setValue('turnstileToken', token, { shouldValidate: token !== '' });
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: FIELDS,
    onSuccess: onSent,
    onFailure: captcha.renew,
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <ReviewFields control={form.control} />
        <CaptchaSubmit
          captcha={captcha}
          action={TURNSTILE_ACTIONS.reviewSubmit}
          error={form.formState.errors.turnstileToken?.message}
          label={text.submit}
          isBusy={form.formState.isSubmitting}
        />
      </PostForm>
    </Form>
  );
}

// Task P4.11.02: /reservasi/[bookingCode]/ulasan, reached only through the signed review link. Turnstile sits right
// before the submit button (docs/StyleGuide.md §5.6); the action checks the link, the limit and the token again.
export function ReviewForm({ bookingCode, submitAction }: ReviewFormProps) {
  const [isSent, setIsSent] = useState(false);
  if (isSent) return <ReviewThanks />;
  return (
    <OpenReviewForm
      bookingCode={bookingCode}
      action={submitAction}
      onSent={() => {
        setIsSent(true);
      }}
    />
  );
}
