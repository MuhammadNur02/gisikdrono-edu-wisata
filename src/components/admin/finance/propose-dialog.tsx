'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { FilePlus2, Search } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState, type ComponentProps } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { useActionForm } from '@/hooks/use-action-form';
import { adjustmentsCopy } from '@/lib/copy/finance-adjustments';
import { formatIDR } from '@/lib/utils/currency';
import { withStepUp } from '@/lib/utils/step-up';
import { bookingLookupSchema } from '@/lib/validations/finance';
import type { ActionResult } from '@/types/action-result';
import type { FinanceBooking } from '@/types/finance';

// The proposal form, with its select, evidence upload and money field, loads when a booking is found, so the
// adjustments page ships only the lookup (admin first-load budget, review of PR #117).
const ProposeForm = dynamic(() =>
  import('@/components/admin/finance/propose-form').then((module) => module.ProposeForm),
);

const text = adjustmentsCopy;

export interface ProposeDialogProps {
  findAction: (values: unknown) => Promise<ActionResult<FinanceBooking>>;
  proposeAction: (values: unknown) => Promise<ActionResult<unknown>>;
  stepUpAction: (values: unknown) => Promise<ActionResult<null>>;
}

function BookingCodeInput(props: ComponentProps<typeof Input>) {
  return (
    <Input {...props} autoCapitalize="characters" placeholder="GSK-XXXXXXXX" className="h-11" />
  );
}

function BookingLookup({
  findAction,
  onFound,
}: Pick<ProposeDialogProps, 'findAction'> & {
  onFound: (booking: FinanceBooking) => void;
}) {
  const form = useForm({
    resolver: zodResolver(bookingLookupSchema),
    defaultValues: { bookingCode: '' },
  });
  const { submit, failure } = useActionForm({
    form,
    action: findAction,
    fields: ['bookingCode'],
    onSuccess: onFound,
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="bookingCode"
          label={text.lookup.code}
          required
          render={(field) => <BookingCodeInput {...field} />}
        />
        <Button type="submit" className="min-h-11 w-full" loading={form.formState.isSubmitting}>
          <Search aria-hidden />
          {text.lookup.find}
        </Button>
      </PostForm>
    </Form>
  );
}

function ProposeButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" className="min-h-11" onClick={onClick}>
      <FilePlus2 aria-hidden />
      {text.propose}
    </Button>
  );
}

// The booking the lookup found, and the proposal for it.
function FoundBooking({
  booking,
  submit,
  onDone,
}: {
  booking: FinanceBooking;
  submit: (values: unknown) => Promise<ActionResult<unknown>>;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-body-sm font-medium">
        {text.lookup.summary(booking.bookingCode, formatIDR(booking.totalAmount))}
      </p>
      <ProposeForm booking={booking} submit={submit} onDone={onDone} />
    </div>
  );
}

// Task P4.7.04: "Usulkan penyesuaian" finds the booking by its code first (never by an id in the URL), then shows the
// proposal for it; the code goes to verifyStaffTotpAction before the proposal goes to proposeAdjustmentAction.
export function ProposeDialog({ findAction, proposeAction, stepUpAction }: ProposeDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [booking, setBooking] = useState<FinanceBooking | null>(null);
  const router = useRouter();
  const open = (next: boolean) => {
    setIsOpen(next);
    if (!next) setBooking(null);
  };
  return (
    <>
      <ProposeButton
        onClick={() => {
          open(true);
        }}
      />
      <ResponsiveDialog
        open={isOpen}
        onOpenChange={open}
        title={text.propose}
        description={text.description}
        size="form"
      >
        {isOpen && booking === null ? (
          <BookingLookup findAction={findAction} onFound={setBooking} />
        ) : null}
        {isOpen && booking !== null ? (
          <FoundBooking
            booking={booking}
            submit={withStepUp(stepUpAction, proposeAction)}
            onDone={() => {
              toast.success(text.proposed);
              open(false);
              router.refresh();
            }}
          />
        ) : null}
      </ResponsiveDialog>
    </>
  );
}
