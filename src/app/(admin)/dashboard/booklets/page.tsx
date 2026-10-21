import { BookOpen } from 'lucide-react';
import type { Metadata } from 'next';

import { BookletDialog } from '@/components/admin/cms/booklet-dialog';
import { BookletTable } from '@/components/admin/cms/booklet-table';
import { OwnerNotice } from '@/components/admin/cms/owner-notice';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { RW_SCOPE_ALL } from '@/config/dashboard';
import { copy } from '@/lib/copy/id';
import {
  createBookletAction,
  removeBookletAction,
  updateBookletAction,
} from '@/server/actions/booklets';
import { ownerOfNewContent, readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listBookletsForStaff } from '@/server/services/booklet-service';

const text = copy.cms.booklets;

export const metadata: Metadata = { title: text.title };

// Task P2.9.06, docs/PRD.md FR-ADMIN-12. Under Semua the superadmin sees every booklet and uploads kelurahan ones.
export default async function BookletsPage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const scope = await readRwScope();
  const owner = ownerOfNewContent(ctx, scope);
  if (owner === undefined) return null;
  const isSuperadmin = ctx.role === 'superadmin';
  const booklets = await listBookletsForStaff(
    isSuperadmin && scope === RW_SCOPE_ALL ? 'all' : owner,
  );

  return (
    <>
      <DashboardPageHeader
        title={text.title}
        description={text.description}
        action={<BookletDialog owner={owner} booklet={null} action={createBookletAction} />}
      />
      <OwnerNotice owner={owner} isSuperadmin={isSuperadmin} />
      {booklets.length === 0 ? (
        <EmptyState icon={BookOpen} title={text.empty} description={text.emptyHint} />
      ) : (
        <BookletTable
          booklets={booklets}
          showOwner={isSuperadmin}
          updateAction={updateBookletAction}
          removeAction={isSuperadmin ? removeBookletAction : null}
        />
      )}
    </>
  );
}
