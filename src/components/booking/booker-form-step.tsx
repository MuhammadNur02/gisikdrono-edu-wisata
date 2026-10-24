'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

import { ParticipantsField } from '@/components/booking/participants-field';
import { PhoneOtpField } from '@/components/booking/phone-otp-field';
import {
  WizardPanel,
  WizardStepFrame,
  type WizardStepProps,
} from '@/components/booking/wizard-step-frame';
import { FormAlert } from '@/components/forms/form-alert';
import { FormField, RequiredMark } from '@/components/forms/form-field';
import { PostForm } from '@/components/forms/post-form';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField as FieldController,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { BOOKING_LIMITS } from '@/config/booking';
import { DB_ENUMS, type EnumValue } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { bookerValues, namedRows } from '@/lib/utils/booking-wizard';
import { schemaResolver } from '@/lib/utils/schema-resolver';
import { bookerStepSchema } from '@/lib/validations/booking';
import type { WizardActions } from '@/types/booking';
import type { ParticipantRow } from '@/types/forms';
import type { VerifiedContact } from '@/types/guest';

const text = copy.booking.wizard.booker;

export interface BookerFormStepProps extends WizardStepProps {
  actions: Pick<WizardActions, 'requestOtp' | 'verifyOtp'>;
}

// What the fields hold while the visitor fills them in: no type chosen yet, rows still empty.
interface BookerFields {
  bookerType: EnumValue<'booker_type'> | undefined;
  institutionName: string;
  picName: string;
  picEmail: string;
  notes: string;
  participants: ParticipantRow[];
  guardianConsent: boolean;
}

type BookerForm = UseFormReturn<
  BookerFields,
  unknown,
  z.output<ReturnType<typeof bookerStepSchema>>
>;

function useBookerForm({ draft, update }: BookerFormStepProps): BookerForm {
  const saved = bookerValues(draft);
  const form = useForm({
    resolver: schemaResolver(bookerStepSchema(draft.pax), (fields: BookerFields) => ({
      ...fields,
      participants: namedRows(fields.participants),
    })),
    defaultValues: { ...saved, bookerType: saved.bookerType ?? undefined },
  });
  useEffect(() => {
    const watcher = form.watch((fields) => {
      update({
        bookerType: fields.bookerType ?? null,
        institutionName: fields.institutionName ?? '',
        picName: fields.picName ?? '',
        picEmail: fields.picEmail ?? '',
        notes: fields.notes ?? '',
        participants: (fields.participants ?? []).map((row) => ({
          fullName: row.fullName ?? '',
          groupLabel: row.groupLabel ?? '',
        })),
        guardianConsent: fields.guardianConsent ?? false,
      });
    });
    return () => {
      watcher.unsubscribe();
    };
  }, [form, update]);
  return form;
}

// The label names the trigger itself: FormControl hands its id to the element it wraps, and the Select root is none.
function BookerTypeField({ form }: { form: BookerForm }) {
  return (
    <FieldController
      control={form.control}
      name="bookerType"
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {text.bookerTypeLabel} <RequiredMark />
          </FormLabel>
          <Select value={field.value ?? ''} onValueChange={field.onChange}>
            <FormControl aria-required>
              <SelectTrigger ref={field.ref} className="w-full" onBlur={field.onBlur}>
                <SelectValue placeholder={text.bookerTypeLabel} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {DB_ENUMS.booker_type.map((type) => (
                <SelectItem key={type} value={type}>
                  {text.bookerTypes[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// docs/PRD.md FR-BOOK-03: a group other than an individual names its institution.
function InstitutionField({ form }: { form: BookerForm }) {
  const bookerType = useWatch({ control: form.control, name: 'bookerType' });
  if (bookerType === undefined || bookerType === 'individual') return null;
  return (
    <FormField
      control={form.control}
      name="institutionName"
      label={text.institutionLabel}
      required
      render={(field) => (
        <Input {...field} autoComplete="organization" maxLength={BOOKING_LIMITS.institutionName} />
      )}
    />
  );
}

function PersonFields({
  form,
  emailFromProof,
}: {
  form: BookerForm;
  emailFromProof: string | null;
}) {
  return (
    <div className="grid items-start gap-5 md:grid-cols-2 md:gap-4">
      <FormField
        control={form.control}
        name="picName"
        label={text.picNameLabel}
        required
        render={(field) => (
          <Input {...field} autoComplete="name" maxLength={BOOKING_LIMITS.picName} />
        )}
      />
      <FormField
        control={form.control}
        name="picEmail"
        label={text.picEmailLabel}
        description={emailFromProof ? text.picEmailFromProof : text.picEmailHint}
        required
        render={(field) => (
          <Input
            {...field}
            type="email"
            autoComplete="email"
            inputMode="email"
            readOnly={emailFromProof !== null}
          />
        )}
      />
    </div>
  );
}

function NotesField({ form }: { form: BookerForm }) {
  return (
    <FormField
      control={form.control}
      name="notes"
      label={text.notesLabel}
      render={(field) => <Textarea {...field} maxLength={BOOKING_LIMITS.notes} />}
    />
  );
}

// docs/Security.md §7.6 (PDP-01): an unticked box of its own, shown once a participant is listed.
function GuardianConsent({ form }: { form: BookerForm }) {
  return (
    <FormField
      control={form.control}
      name="guardianConsent"
      label={text.guardianConsent}
      required
      className="flex flex-row-reverse items-start justify-end gap-3 space-y-0"
      render={(field) => (
        <Checkbox
          checked={field.value}
          onBlur={field.onBlur}
          onCheckedChange={(checked) => {
            field.onChange(checked === true);
          }}
        />
      )}
    />
  );
}

function ParticipantRows({ form, pax }: { form: BookerForm; pax: number }) {
  const rows = useWatch({ control: form.control, name: 'participants' });
  const error = form.formState.errors.participants;
  return (
    <ParticipantsField
      rows={rows}
      pax={pax}
      error={error ? (error.message ?? copy.booking.validation.participantName) : undefined}
      consent={<GuardianConsent form={form} />}
      onChange={(next) => {
        form.setValue('participants', next, { shouldDirty: true });
      }}
    />
  );
}

function PhoneProofField(props: BookerFormStepProps & { form: BookerForm; showMissing: boolean }) {
  const { draft, update, actions, form, showMissing } = props;
  const onVerified = (contact: VerifiedContact) => {
    update({ contact: { ...contact, verifiedAt: Date.now() } });
    if (contact.email !== null) form.setValue('picEmail', contact.email, { shouldValidate: true });
  };
  return (
    <WizardPanel title={text.verifyTitle}>
      <p className="-mt-3 text-body-sm text-ink-2">{text.verifyHint}</p>
      {showMissing && draft.contact === null && (
        <FormAlert tone="danger">{text.verifyFirst}</FormAlert>
      )}
      <PhoneOtpField
        requestAction={actions.requestOtp}
        verifyAction={actions.verifyOtp}
        verified={draft.contact}
        onVerified={onVerified}
        onContactChange={() => {
          update({ contact: null });
        }}
      />
    </WizardPanel>
  );
}

// DESIGN-SPEC §3.10 step 2: the group, its contact, the proved number, a note and the names, a panel each.
type BookerPanelsProps = BookerFormStepProps & {
  form: BookerForm;
  emailFromProof: string | null;
  showMissing: boolean;
};

function BookerPanels({ form, emailFromProof, showMissing, ...props }: BookerPanelsProps) {
  return (
    <>
      <WizardPanel>
        <BookerTypeField form={form} />
      </WizardPanel>
      <WizardPanel title={text.identityTitle}>
        <InstitutionField form={form} />
        <PersonFields form={form} emailFromProof={emailFromProof} />
      </WizardPanel>
      <PhoneProofField {...props} form={form} showMissing={showMissing} />
      <WizardPanel>
        <NotesField form={form} />
      </WizardPanel>
      <WizardPanel>
        <ParticipantRows form={form} pax={props.draft.pax} />
      </WizardPanel>
    </>
  );
}

// Step data (docs/PRD.md FR-BOOK-03, FR-B2B-09; Task P3.5.02): the person in charge, the group, the participants
// (names and class only, the guardian's consent once there are any), and the WhatsApp number proved by its code
// before any seat is held. While WhatsApp is limited the address proved stands in, so the booking names it as is.
export function BookerFormStep(props: BookerFormStepProps) {
  const { draft, update, onDone, onBack } = props;
  const form = useBookerForm(props);
  const [showMissing, setShowMissing] = useState(false);
  const emailFromProof = draft.contact?.channel === 'email' ? draft.contact.email : null;
  const submit = form.handleSubmit(() => {
    if (draft.contact === null) {
      setShowMissing(true);
      return;
    }
    update({ participants: namedRows(form.getValues('participants')) });
    onDone();
  });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        <WizardStepFrame
          title={text.title}
          description={text.description}
          onBack={onBack}
          backLabel={props.backLabel}
          nextLabel={props.nextLabel}
        >
          <BookerPanels
            {...props}
            form={form}
            emailFromProof={emailFromProof}
            showMissing={showMissing}
          />
        </WizardStepFrame>
      </PostForm>
    </Form>
  );
}
