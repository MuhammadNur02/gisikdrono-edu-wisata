import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { OwnerNotice } from '@/components/admin/cms/owner-notice';
import { RwPageForm } from '@/components/admin/cms/rw-page-form';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { copy } from '@/lib/copy/id';
import { updateRwPageAction } from '@/server/actions/pages';
import { ownerOfNewContent, readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { readRwPageForStaff } from '@/server/services/rw-page-service';

const text = copy.cms.pages;

export const metadata: Metadata = { title: text.title };

// Task P2.9.06: the RW admin edits their own RW's page; the superadmin the one the RwSwitcher points at.
export default async function RwPagesPage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const rwId = ownerOfNewContent(ctx, await readRwScope());
  const isSuperadmin = ctx.role === 'superadmin';
  const header = <DashboardPageHeader title={text.title} description={text.description} />;
  if (rwId === null || rwId === undefined) {
    return (
      <>
        {header}
        <OwnerNotice owner={null} isSuperadmin={isSuperadmin} rwOnly />
      </>
    );
  }
  const page = await readRwPageForStaff(rwId);
  if (!page) notFound();

  return (
    <>
      <DashboardPageHeader
        title={text.title}
        description={text.description}
        action={
          <Button asChild variant="outline">
            <Link href={page.path}>{text.view}</Link>
          </Button>
        }
      />
      <OwnerNotice owner={rwId} isSuperadmin={isSuperadmin} />
      <Card className="max-w-2xl">
        <CardContent>
          <RwPageForm page={page} action={updateRwPageAction} />
        </CardContent>
      </Card>
    </>
  );
}
