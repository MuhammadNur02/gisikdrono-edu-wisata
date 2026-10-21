import { UserRound } from 'lucide-react';
import Link from 'next/link';

import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PROFILE_PATH } from '@/config/dashboard';
import { copy } from '@/lib/copy/id';
import { staffRoleLabel } from '@/lib/utils/staff-labels';
import { requireDashboardStaff } from '@/server/auth/session';

const text = copy.dashboard.home;

// The provisional overview of Task P2.8.03; the KPIs of Task P4.2.03 replace it.
export default async function DashboardPage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;

  return (
    <>
      <DashboardPageHeader
        title={text.title}
        description={text.signedInAs(staffRoleLabel(ctx.rwId))}
      />
      <Card variant="feature" className="max-w-xl">
        <CardHeader>
          <UserRound aria-hidden />
          <CardTitle>{text.profileTitle}</CardTitle>
          <CardDescription>{text.profileDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={PROFILE_PATH}>{text.profileLink}</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
