import type { Metadata } from 'next';

import { GalleryBoard } from '@/components/admin/cms/gallery-table';
import { OwnerNotice } from '@/components/admin/cms/owner-notice';
import { GALLERY_CATEGORY_LABELS } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { cmsCopy } from '@/lib/copy/cms';
import { contentListsCopy } from '@/lib/copy/content-lists';
import { contentStatusFacet, listFacets, rwFacet } from '@/lib/utils/facets';
import { loadListQuery } from '@/lib/utils/list-query';
import {
  archiveGalleryItemAction,
  createGalleryItemAction,
  removeGalleryItemAction,
  updateGalleryItemAction,
} from '@/server/actions/galleries';
import { effectiveRw, ownerOfNewContent, readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listGalleryForStaff } from '@/server/services/gallery-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import type { ListFacet } from '@/types/data-table';

const text = cmsCopy.galleries;
const lists = contentListsCopy;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ACTIONS = {
  create: createGalleryItemAction,
  update: updateGalleryItemAction,
  archive: archiveGalleryItemAction,
  remove: removeGalleryItemAction,
};

const CATEGORY_FACET: ListFacet = {
  param: 'category',
  title: lists.facets.category,
  options: DB_ENUMS.gallery_category.map((category) => ({
    value: category,
    label: GALLERY_CATEGORY_LABELS[category],
  })),
};

// Task P2.9.06 and P4.3.03, docs/PRD.md FR-ADMIN-10: one page of gallery items from
// `?q=&sort=&page=&status=&category=&rw=`. The list follows effectiveRw; a new item belongs to the owner the
// RwSwitcher points at (the kelurahan under Semua).
export default async function GalleriesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const query = await loadListQuery(searchParams);
  const isSuperadmin = ctx.role === 'superadmin';
  const [rw, rwUnits, scope] = await Promise.all([
    effectiveRw(ctx, query.rw),
    listRwUnitsForStaff(),
    readRwScope(),
  ]);
  const owner = ownerOfNewContent(ctx, scope);
  if (owner === undefined) return null;
  const result = await listGalleryForStaff(query, rw);
  const facets = listFacets(isSuperadmin, {
    status: contentStatusFacet(lists.facets.status),
    others: [CATEGORY_FACET],
    rw: rwFacet(lists.facets.rw, rwUnits),
  });

  return (
    <GalleryBoard
      rows={result.rows}
      total={result.total}
      facets={facets}
      notice={<OwnerNotice owner={owner} isSuperadmin={isSuperadmin} />}
      showOwner={isSuperadmin}
      owner={owner}
      actions={ACTIONS}
    />
  );
}
