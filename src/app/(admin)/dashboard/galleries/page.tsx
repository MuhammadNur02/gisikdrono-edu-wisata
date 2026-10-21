import { Images } from 'lucide-react';
import type { Metadata } from 'next';

import { AddGalleryItemDialog } from '@/components/admin/cms/gallery-dialogs';
import { GalleryGrid } from '@/components/admin/cms/gallery-grid';
import { OwnerNotice } from '@/components/admin/cms/owner-notice';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { RW_SCOPE_ALL } from '@/config/dashboard';
import { copy } from '@/lib/copy/id';
import {
  createGalleryItemAction,
  removeGalleryItemAction,
  updateGalleryItemAction,
} from '@/server/actions/galleries';
import { ownerOfNewContent, readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listGalleryForStaff } from '@/server/services/gallery-service';

const text = copy.cms.galleries;

export const metadata: Metadata = { title: text.title };

// Task P2.9.06, docs/PRD.md FR-ADMIN-10. Under Semua the superadmin sees every item and adds kelurahan photos.
export default async function GalleriesPage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const scope = await readRwScope();
  const owner = ownerOfNewContent(ctx, scope);
  if (owner === undefined) return null;
  const isSuperadmin = ctx.role === 'superadmin';
  const items = await listGalleryForStaff(isSuperadmin && scope === RW_SCOPE_ALL ? 'all' : owner);

  return (
    <>
      <DashboardPageHeader
        title={text.title}
        description={text.description}
        action={<AddGalleryItemDialog owner={owner} action={createGalleryItemAction} />}
      />
      <OwnerNotice owner={owner} isSuperadmin={isSuperadmin} />
      {items.length === 0 ? (
        <EmptyState icon={Images} title={text.empty} description={text.emptyHint} />
      ) : (
        <GalleryGrid
          items={items}
          showOwner={isSuperadmin}
          updateAction={updateGalleryItemAction}
          removeAction={removeGalleryItemAction}
        />
      )}
    </>
  );
}
