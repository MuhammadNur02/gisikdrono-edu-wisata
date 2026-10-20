import type { Metadata } from 'next';

import { ProfileForm } from '@/components/admin/profile/profile-form';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { Card, CardContent } from '@/components/ui/card';
import { copy } from '@/lib/copy/id';
import { staffRoleLabel, staffRwId } from '@/lib/utils/staff-labels';
import { updateProfileAction } from '@/server/actions/profile';
import { requireDashboardStaff } from '@/server/auth/session';
import { readOwnProfile } from '@/server/services/profile-service';

const text = copy.dashboard.profile;

export const metadata: Metadata = { title: text.title };

// Task P2.8.03. The avatar upload and MFA re-enrolment join this page in Task P4.8.03.
export default async function ProfilePage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const profile = await readOwnProfile(ctx.userId);

  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} />
      <Card className="max-w-xl">
        <CardContent className="space-y-6">
          <div className="space-y-1">
            <p className="text-body-sm font-medium">{text.role}</p>
            <p className="text-body-sm">{staffRoleLabel(staffRwId(ctx.rwId))}</p>
          </div>
          <ProfileForm profile={profile} action={updateProfileAction} />
        </CardContent>
      </Card>
    </>
  );
}
