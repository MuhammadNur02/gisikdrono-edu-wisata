import type { ReactNode } from 'react';

import { DocumentPolicyGuard } from '@/components/providers/document-policy-guard';
import { MotionProvider } from '@/components/providers/motion-provider';
import { JsonLd } from '@/components/seo/json-ld';
import { Toaster } from '@/components/ui/sonner';
import { fontClassNames } from '@/config/fonts';
import { governmentOrganizationJsonLd } from '@/lib/seo/json-ld';
import { rootMetadata } from '@/lib/seo/metadata';

import '@/styles/globals.css';

export const metadata = rootMetadata;

// No headers(), cookies() or nonce here: this layout wraps the public ISR pages too, and reading the
// request would render every one of them per request (CLAUDE.md §5.1). On private routes Next.js puts
// the middleware's nonce on its own scripts; a next/script those routes need reads it in their own layout.
// The theme provider lives in each route group because public pages are always light (decision D3).
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id" className={fontClassNames} suppressHydrationWarning>
      <body>
        <MotionProvider>{children}</MotionProvider>
        <Toaster />
        <DocumentPolicyGuard />
        <JsonLd data={governmentOrganizationJsonLd()} />
      </body>
    </html>
  );
}
