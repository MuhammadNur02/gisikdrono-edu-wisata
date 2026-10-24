import type { Metadata } from 'next';

import { ProfileForm } from '@/components/admin/profile/profile-form';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { Card, CardContent } from '@/components/ui/card';
import { copy } from '@/lib/copy/id';
import { staffCopy } from '@/lib/copy/staff';
import { staffRoleLabel } from '@/lib/utils/staff-labels';
import { updateProfileAction } from '@/server/actions/profile';
import { requireDashboardStaff } from '@/server/auth/session';
import { readOwnProfile } from '@/server/services/profile-service';

const text = copy.dashboard.profile;

export const metadata: Metadata = { title: text.title };

// Task P2.8.03, P4.8.03: the name and the phone. A new authenticator is enrolled only with the one-time code the
// superadmin hands over after an MFA reset (P4.8.05, docs/Security.md R24), so the page says how instead of offering
// a self-service replacement; the avatar waits for its own upload purpose (Task.md P4.8.03 note).
export default async function ProfilePage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const profile = await readOwnProfile(ctx.userId);

  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} />
      <div className="max-w-xl space-y-6">
        <Card>
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <p className="text-body-sm font-medium">{text.role}</p>
              <p className="text-body-sm">{staffRoleLabel(ctx.rwId)}</p>
            </div>
            <ProfileForm profile={profile} action={updateProfileAction} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1">
            <h2 className="text-body font-medium">{staffCopy.profile.security}</h2>
            <p className="text-body-sm text-muted-foreground">{staffCopy.profile.securityHint}</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
