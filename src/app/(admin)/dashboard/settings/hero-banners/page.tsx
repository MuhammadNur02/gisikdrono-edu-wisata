import { GalleryHorizontal } from 'lucide-react';
import type { Metadata } from 'next';

import { HeroBannerDialog } from '@/components/admin/cms/hero-banner-dialog';
import { HeroBannerTable } from '@/components/admin/cms/hero-banner-table';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { FormAlert } from '@/components/forms/form-alert';
import { copy } from '@/lib/copy/id';
import {
  createHeroBannerAction,
  removeHeroBannerAction,
  updateHeroBannerAction,
} from '@/server/actions/hero-banners';
import { requireDashboardStaff } from '@/server/auth/session';
import { listBannerProducts, listHeroBannersForStaff } from '@/server/services/hero-banner-service';

const text = copy.cms.banners;

export const metadata: Metadata = { title: text.title };

// Task P2.9.06, docs/PRD.md FR-ADMIN-23: the superadmin's alone. An RW admin has no menu item for it, and opening
// the address directly says so instead of showing anything.
export default async function HeroBannersPage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  if (ctx.role !== 'superadmin') {
    return (
      <>
        <DashboardPageHeader title={text.title} />
        <FormAlert tone="info">{text.onlySuper}</FormAlert>
      </>
    );
  }
  const [banners, products] = await Promise.all([listHeroBannersForStaff(), listBannerProducts()]);
  const addButton = (
    <HeroBannerDialog banner={null} products={products} action={createHeroBannerAction} />
  );

  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} action={addButton} />
      {banners.length === 0 ? (
        <EmptyState icon={GalleryHorizontal} title={text.empty} description={text.emptyHint} />
      ) : (
        <HeroBannerTable
          banners={banners}
          products={products}
          updateAction={updateHeroBannerAction}
          removeAction={removeHeroBannerAction}
        />
      )}
    </>
  );
}
