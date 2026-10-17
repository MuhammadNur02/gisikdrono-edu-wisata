'use client';

import { ErrorNotice } from '@/components/layout/error-notice';
import { fontClassNames } from '@/config/fonts';

import '@/styles/globals.css';

// Replaces the root layout when that layout itself fails, so it brings its own <html> and fonts.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id" className={fontClassNames}>
      <body>
        <ErrorNotice errorCode={error.digest} onRetry={reset} />
      </body>
    </html>
  );
}
