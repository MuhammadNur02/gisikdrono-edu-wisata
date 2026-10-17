'use client';

import { ErrorNotice } from '@/components/layout/error-notice';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorNotice errorCode={error.digest} onRetry={reset} />;
}
