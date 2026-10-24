'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Control } from 'react-hook-form';
import type { z } from 'zod';

import { FormField } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PHONE_LAST_DIGITS } from '@/config/scanner';
import { scannerCopy } from '@/lib/copy/scanner';
import { manualCheckInRequestSchema } from '@/lib/validations/scanner';

const text = scannerCopy.manual;
const manualFieldsSchema = manualCheckInRequestSchema.pick({
  bookingCode: true,
  phoneLastDigits: true,
});

type ManualFieldControl = Control<
  z.input<typeof manualFieldsSchema>,
  unknown,
  z.output<typeof manualFieldsSchema>
>;

function ManualFields({ control }: { control: ManualFieldControl }) {
  return (
    <>
      <FormField
        control={control}
        name="bookingCode"
        label={text.bookingCode}
        required
        render={(field) => (
          <Input
            {...field}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="h-11 font-mono uppercase"
          />
        )}
      />
      <FormField
        control={control}
        name="phoneLastDigits"
        label={text.phoneLastDigits}
        required
        render={(field) => (
          <Input
            {...field}
            inputMode="numeric"
            autoComplete="off"
            maxLength={PHONE_LAST_DIGITS}
            className="h-11 w-32 text-center font-mono tabular-nums"
          />
        )}
      />
    </>
  );
}

export interface ManualCheckInFormProps {
  isBusy: boolean;
  onSubmit: (bookingCode: string, phoneLastDigits: string) => void;
}

// docs/PRD.md FR-SCAN-07, docs/StyleGuide.md §6.6 ManualCodeInput: for a QR that will not read, the booking code and
// the last four digits of the PIC's verified WhatsApp number. The server finds today's ticket of the officer's RW,
// checks the digits and logs `manual_checkin`; the same preview and commit follow.
export function ManualCheckInForm({ isBusy, onSubmit }: ManualCheckInFormProps) {
  const form = useForm({
    resolver: zodResolver(manualFieldsSchema),
    defaultValues: { bookingCode: '', phoneLastDigits: '' },
  });
  const submit = form.handleSubmit((values) => {
    onSubmit(values.bookingCode, values.phoneLastDigits);
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        <p className="text-body-sm text-muted-foreground">{text.description}</p>
        <ManualFields control={form.control} />
        <Button type="submit" size="lg" className="w-full" loading={isBusy}>
          {text.submit}
        </Button>
      </PostForm>
    </Form>
  );
}
