'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { OptionSelect } from '@/components/admin/finance/option-select';
import { TotpCodeField } from '@/components/auth/totp-code-field';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { REVIEW_REASON_LIMITS, REVIEW_RESOLUTIONS } from '@/config/bookings';
import { useActionForm } from '@/hooks/use-action-form';
import { bookingStaffCopy } from '@/lib/copy/booking-staff';
import { staffCopy } from '@/lib/copy/staff';
import { withStepUp } from '@/lib/utils/step-up';
import { resolveReviewFormSchema } from '@/lib/validations/booking-staff';
import type { ActionResult } from '@/types/action-result';
import type { ReviewLeg } from '@/types/booking-staff';

const text = bookingStaffCopy.review;

type StepAction = (input: unknown) => Promise<ActionResult<null>>;

export interface ResolveReviewFormProps {
  bookingId: string;
  legs: ReviewLeg[];
  action: StepAction;
  stepUpAction: StepAction;
  onDone: () => void;
}

const RESOLUTION_OPTIONS = REVIEW_RESOLUTIONS.map((resolution) => ({
  value: resolution,
  label: text.resolutions[resolution],
}));

function useReviewForm(props: ResolveReviewFormProps) {
  const form = useForm({
    resolver: zodResolver(resolveReviewFormSchema),
    defaultValues: {
      bookingId: props.bookingId,
      resolution: 'move' as const,
      reason: '',
      sessionIds: props.legs.map(() => ''),
      code: '',
    },
  });
  const { submit, failure } = useActionForm({
    form,
    action: withStepUp(props.stepUpAction, (values) => props.action(withoutEmptySessions(values))),
    fields: ['reason', 'sessionIds', 'code'],
    onSuccess: props.onDone,
  });
  return { form, submit, failure };
}

// A refund names no session; a move names one per leg, which the schema checks.
function withoutEmptySessions(values: unknown): unknown {
  if (typeof values !== 'object' || values === null || !('resolution' in values)) return values;
  return values.resolution === 'refund' ? { ...values, sessionIds: [] } : values;
}

type ReviewForm = ReturnType<typeof useReviewForm>['form'];

// react-hook-form names an array item by its index, a path its types spell with a number.
function sessionFieldName(index: number): `sessionIds.${number}` {
  return `sessionIds.${index.toString()}` as `sessionIds.${number}`;
}

function SessionFields({ form, legs }: { form: ReviewForm; legs: ReviewLeg[] }) {
  return legs.map((leg, index) => (
    <FormField
      key={leg.rwLabel}
      control={form.control}
      name={sessionFieldName(index)}
      label={text.session(leg.rwLabel)}
      description={leg.sessions.length === 0 ? text.noSessions : undefined}
      required
      wrapsOwnControl
      render={(field) => (
        <OptionSelect
          value={field.value}
          onChange={field.onChange}
          options={leg.sessions}
          placeholder={text.sessionPlaceholder}
          trigger={field}
          disabled={leg.sessions.length === 0}
        />
      )}
    />
  ));
}

export function ResolveReviewForm(props: ResolveReviewFormProps) {
  const { form, submit, failure } = useReviewForm(props);
  const resolution = form.watch('resolution');
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        <FormAlert tone="info">{text.description}</FormAlert>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="resolution"
          label={text.resolution}
          required
          wrapsOwnControl
          render={(field) => (
            <OptionSelect
              value={field.value}
              onChange={field.onChange}
              options={RESOLUTION_OPTIONS}
              placeholder={text.resolution}
              trigger={field}
            />
          )}
        />
        {resolution === 'move' ? <SessionFields form={form} legs={props.legs} /> : null}
        <FormField
          control={form.control}
          name="reason"
          label={text.reason}
          required
          render={(field) => <Textarea {...field} rows={3} maxLength={REVIEW_REASON_LIMITS.max} />}
        />
        <TotpCodeField control={form.control} name="code" description={staffCopy.stepUp.hint} />
        <Button type="submit" className="min-h-11 w-full" loading={form.formState.isSubmitting}>
          {text.submit}
        </Button>
      </PostForm>
    </Form>
  );
}
