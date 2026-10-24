'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormAlert } from '@/components/forms/form-alert';
import { FormField } from '@/components/forms/form-field';
import { PhoneInput } from '@/components/forms/phone-input';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useActionForm } from '@/hooks/use-action-form';
import { copy } from '@/lib/copy/id';
import { staffCopy } from '@/lib/copy/staff';
import { updateProfileSchema } from '@/lib/validations/dashboard';
import type { ActionResult } from '@/types/action-result';
import type { StaffProfile } from '@/types/staff';

const text = copy.dashboard.profile;

export interface ProfileFormProps {
  profile: StaffProfile;
  // updateProfileAction, handed in by the page.
  action: (values: unknown) => Promise<ActionResult<StaffProfile>>;
}

function SignInEmail({ email }: { email: string }) {
  return (
    <div className="space-y-2">
      <p className="text-body-sm font-medium">{text.email}</p>
      <p className="text-body-sm break-all">{email}</p>
      <p className="text-caption text-muted-foreground">{text.emailHint}</p>
    </div>
  );
}

function valuesOf(profile: StaffProfile) {
  return { fullName: profile.fullName, phone: profile.phone ?? '' };
}

function useProfileForm({ profile, action }: ProfileFormProps) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: valuesOf(profile),
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['fullName', 'phone'],
    onSuccess: (saved) => {
      form.reset(valuesOf(saved));
      toast.success(text.saved);
      router.refresh();
    },
  });
  return { form, submit, failure };
}

// Task P2.8.03, P4.8.03: the staff member's own name and phone. The email is shown, not edited (it is the sign-in
// address).
export function ProfileForm({ profile, action }: ProfileFormProps) {
  const { form, submit, failure } = useProfileForm({ profile, action });
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        {failure ? <FormAlert tone="danger">{failure}</FormAlert> : null}
        <FormField
          control={form.control}
          name="fullName"
          label={text.fullName}
          required
          render={(field) => <Input {...field} autoComplete="name" />}
        />
        <FormField
          control={form.control}
          name="phone"
          label={staffCopy.profile.phone}
          description={staffCopy.profile.phoneHint}
          render={(field) => <PhoneInput {...field} value={field.value ?? ''} />}
        />
        <SignInEmail email={profile.email} />
        <Button
          type="submit"
          loading={form.formState.isSubmitting}
          disabled={!form.formState.isDirty}
        >
          {text.save}
        </Button>
      </PostForm>
    </Form>
  );
}
