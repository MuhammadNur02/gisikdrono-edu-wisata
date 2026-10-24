import { WifiOff } from 'lucide-react';
import type { Metadata } from 'next';

import { Button } from '@/components/ui/button';
import { SCANNER_PATH } from '@/config/dashboard';
import { scannerCopy } from '@/lib/copy/scanner';

const text = scannerCopy.offline;

export const dynamic = 'force-static';
export const metadata: Metadata = { title: text.title, robots: { index: false, follow: false } };

// Task P4.4.03, docs/PRD.md FR-SCAN-01: what the scanner's service worker shows when a page cannot reach the network.
// Static and the same for everyone, so it holds no name, no booking and no nonce, and it needs no script: `Muat ulang`
// is a plain link back to the scanner.
export default function OfflinePage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <section className="w-full max-w-md space-y-4 text-center" aria-labelledby="offline-title">
        <WifiOff aria-hidden className="mx-auto size-12 text-danger" />
        <h1 id="offline-title" className="text-h2">
          {text.title}
        </h1>
        <p className="text-body text-muted-foreground">{text.description}</p>
        <Button asChild size="lg">
          <a href={SCANNER_PATH}>{text.reload}</a>
        </Button>
        <p className="text-body-sm text-muted-foreground">{text.paperFallback}</p>
      </section>
    </main>
  );
}
