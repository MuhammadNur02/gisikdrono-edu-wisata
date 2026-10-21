import Link from 'next/link';

import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { Button } from '@/components/ui/button';
import { DASHBOARD_PATH } from '@/config/auth';
import { copy } from '@/lib/copy/id';

const text = copy.cms.notFound;

// Decision of 2026-10-21 (review of PR #18): content of another RW answers exactly like content that does not exist,
// a real 404 inside the dashboard, since RLS hides its row from the page.
export default function DashboardNotFound() {
  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} />
      <Button asChild variant="outline" className="self-start">
        <Link href={DASHBOARD_PATH}>{text.back}</Link>
      </Button>
    </>
  );
}
