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
import { Input } from '@/components/ui/input';
import { useActionForm } from '@/hooks/use-action-form';
import { copy } from '@/lib/copy/id';
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

// Task P2.8.03: the staff member's own name. The email is shown, not edited (it is the sign-in address).
export function ProfileForm({ profile, action }: ProfileFormProps) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { fullName: profile.fullName },
  });
  const { submit, failure } = useActionForm({
    form,
    action,
    fields: ['fullName'],
    onSuccess: (saved) => {
      form.reset({ fullName: saved.fullName });
      toast.success(text.saved);
      router.refresh();
    },
  });

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
