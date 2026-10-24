import type { Metadata } from 'next';

import { HeroBannerBoard } from '@/components/admin/cms/hero-banner-table';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { BANNER_ACTIVITY } from '@/config/cms';
import { cmsCopy } from '@/lib/copy/cms';
import { contentListsCopy } from '@/lib/copy/content-lists';
import { bannerPhase } from '@/lib/utils/hero-banners';
import { loadListQuery } from '@/lib/utils/list-query';
import {
  createHeroBannerAction,
  deactivateHeroBannerAction,
  moveHeroBannerAction,
  removeHeroBannerAction,
  updateHeroBannerAction,
} from '@/server/actions/hero-banners';
import { requireDashboardStaff } from '@/server/auth/session';
import { listBannerProducts, listHeroBannersForStaff } from '@/server/services/hero-banner-service';
import type { ListFacet } from '@/types/data-table';

const text = cmsCopy.banners;
const lists = contentListsCopy;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ACTIONS = {
  create: createHeroBannerAction,
  update: updateHeroBannerAction,
  deactivate: deactivateHeroBannerAction,
  remove: removeHeroBannerAction,
  move: moveHeroBannerAction,
};

// A banner has no content_status: `?status=` reads is_active (BANNER_ACTIVITY).
const ACTIVITY_LABELS = { active: text.active, inactive: text.inactive } as const;
const FACETS: ListFacet[] = [
  {
    param: 'status',
    title: lists.facets.status,
    options: BANNER_ACTIVITY.map((value) => ({ value, label: ACTIVITY_LABELS[value] })),
  },
];

// Task P2.9.06 and P4.9.02, docs/PRD.md FR-ADMIN-23: the superadmin's alone. An RW admin has no menu item for it, and
// opening the address directly says so instead of showing anything.
export default async function HeroBannersPage({ searchParams }: { searchParams: SearchParams }) {
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
  const query = await loadListQuery(searchParams);
  const [result, products] = await Promise.all([
    listHeroBannersForStaff(query),
    listBannerProducts(),
  ]);
  const now = new Date();
  const rows = result.rows.map((banner) => ({
    ...banner,
    phase: bannerPhase(banner, now),
    productName: products.find((product) => product.id === banner.productId)?.name ?? null,
  }));

  return (
    <HeroBannerBoard
      rows={rows}
      total={result.total}
      facets={FACETS}
      products={products}
      actions={ACTIONS}
    />
  );
}
