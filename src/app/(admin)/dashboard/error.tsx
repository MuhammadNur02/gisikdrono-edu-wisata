'use client';

import { ErrorCard } from '@/components/admin/shell/error-card';

// docs/StyleGuide.md §6.9 (Task P4.1.02): a segment that fails shows the error card inside the shell; the sidebar and
// the topbar stay, so the staff member can move on to another page.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorCard errorCode={error.digest} onRetry={reset} />;
}
