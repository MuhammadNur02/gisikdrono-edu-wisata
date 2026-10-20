import type { Metadata } from 'next';

import { AuthCard } from '@/components/auth/auth-card';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { copy } from '@/lib/copy/id';
import { requestPasswordResetAction } from '@/server/actions/auth';

const text = copy.auth.forgot;

export const metadata: Metadata = { title: text.title };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title={text.title} description={text.description}>
      <ForgotPasswordForm action={requestPasswordResetAction} />
    </AuthCard>
  );
}
