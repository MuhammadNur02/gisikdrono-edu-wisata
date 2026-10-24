import { CONTENT_STATUS } from '@/config/status';
import { DB_ENUMS, type EnumValue } from '@/db/enums';
import type { ListFacet } from '@/types/data-table';

// The faceted filters every content list repeats (Task P4.3.03, docs/StyleGuide.md §6.4): status over content_status
// and, for the superadmin only, the RW. An RW admin's lists are their own RW's whatever the URL says (effectiveRw), so
// they get no RW facet to pick another one with.

type ContentStatus = EnumValue<'content_status'>;

export function contentStatusFacet(
  title: string,
  statuses: readonly ContentStatus[] = DB_ENUMS.content_status,
): ListFacet {
  return {
    param: 'status',
    title,
    options: statuses.map((status) => ({ value: status, label: CONTENT_STATUS[status].label })),
  };
}

export function rwFacet(
  title: string,
  rwUnits: readonly { id: number; name: string }[],
): ListFacet {
  return {
    param: 'rw',
    title,
    options: rwUnits.map((unit) => ({ value: String(unit.id), label: unit.name })),
  };
}

// The facets of a list: the RW one only when the staff member may choose between RWs.
export function listFacets(
  isSuperadmin: boolean,
  facets: { status?: ListFacet; rw: ListFacet; others?: readonly ListFacet[] },
): ListFacet[] {
  return [
    ...(facets.status ? [facets.status] : []),
    ...(facets.others ?? []),
    ...(isSuperadmin ? [facets.rw] : []),
  ];
}
