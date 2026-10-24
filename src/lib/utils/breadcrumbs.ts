import { HOME_NAV_ITEM } from '@/config/nav';
import type { BreadcrumbItem } from '@/lib/seo/json-ld';

// Beranda, the pages above, then this page: the trail both the visible breadcrumbs and the BreadcrumbList read, so the
// two can never disagree.
export function breadcrumbTrail(
  ancestors: readonly BreadcrumbItem[],
  current: BreadcrumbItem,
): BreadcrumbItem[] {
  return [{ name: HOME_NAV_ITEM.label, path: HOME_NAV_ITEM.href }, ...ancestors, current];
}
