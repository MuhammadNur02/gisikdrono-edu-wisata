import type { Metadata } from 'next';

import { ScannerView } from '@/components/admin/scanner/scanner-view';
import { ServiceWorkerRegistration } from '@/components/admin/scanner/service-worker-registration';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { SCANNER_MANIFEST_PATH } from '@/config/scanner';
import { scannerCopy } from '@/lib/copy/scanner';
import { safeRedirect } from '@/lib/utils/safe-redirect';
import { logScannerOpenedAction } from '@/server/actions/scanner';
import { requireDashboardStaff } from '@/server/auth/session';

const text = scannerCopy;

// The scanner's own manifest replaces the site's for this page, so installing it installs the scanner.
export const metadata: Metadata = { title: text.title, manifest: SCANNER_MANIFEST_PATH };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Installing the PWA is the browser's own menu on both platforms (Task P4.4.03).
function InstallGuide() {
  return (
    <details className="mx-auto w-full max-w-2xl rounded-xl border border-border p-4 text-body-sm">
      <summary className="min-h-11 cursor-pointer content-center font-medium">
        {text.install.title}
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>{text.install.android}</li>
        <li>{text.install.ios}</li>
      </ul>
    </details>
  );
}

function returnPathOf(value: string | string[] | undefined): string | null {
  const target = Array.isArray(value) ? value[0] : value;
  const path = safeRedirect(target, '');
  return path === '' ? null : path;
}

// docs/PRD.md FR-SCAN-01..07, docs/StyleGuide.md §6.6 (Task P4.4.04): the gate scanner, the PWA's start page and the
// only route with camera=(self) (src/lib/csp.ts). The dashboard layout has already let only AAL2 staff in; the
// check itself happens on the server, in POST /api/tickets/verify (Task P4.4.02), never here.
export default async function ScannerPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const params = await searchParams;
  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} />
      <ScannerView
        canOverride={ctx.role === 'superadmin'}
        returnTo={returnPathOf(params.return)}
        logOpenedAction={logScannerOpenedAction}
      />
      <InstallGuide />
      <ServiceWorkerRegistration />
    </>
  );
}
