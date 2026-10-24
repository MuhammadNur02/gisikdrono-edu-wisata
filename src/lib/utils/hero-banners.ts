// The home page's slides on the dashboard (Task P4.9.02, docs/PRD.md FR-ADMIN-23). Pure, so the list, the preview and
// the reorder action read a banner's window and order the same way.

export type BannerPhase = 'live' | 'scheduled' | 'ended' | 'inactive';

export type BannerMove = 'up' | 'down';

export interface BannerWindow {
  isActive: boolean;
  // ISO instants, or null for no bound.
  startsAt: string | null;
  endsAt: string | null;
}

// Where a banner stands now, by the rule hero_banners_public_read applies (0005): switched on, started, not ended.
export function bannerPhase(banner: BannerWindow, now: Date): BannerPhase {
  if (!banner.isActive) return 'inactive';
  const at = now.getTime();
  if (banner.startsAt !== null && new Date(banner.startsAt).getTime() > at) return 'scheduled';
  if (banner.endsAt !== null && new Date(banner.endsAt).getTime() <= at) return 'ended';
  return 'live';
}

export interface BannerOrder {
  id: string;
  sortOrder: number;
}

// The sort_order writes that move one banner a place up or down the home page's order (`order` as the page reads it:
// by sort_order, then newest first). Every banner is renumbered 0, 1, 2… so equal numbers from older edits stop tying;
// only the rows whose number changes are returned, and none when the banner is already at that end.
export function reorderBanners(
  order: readonly BannerOrder[],
  id: string,
  move: BannerMove,
): BannerOrder[] {
  const from = order.findIndex((banner) => banner.id === id);
  const to = move === 'up' ? from - 1 : from + 1;
  const moved = order[from];
  const neighbour = order[to];
  if (from === -1 || moved === undefined || neighbour === undefined) return [];
  const next = [...order];
  next[from] = neighbour;
  next[to] = moved;
  return next
    .map((banner, position) => ({ before: banner.sortOrder, id: banner.id, sortOrder: position }))
    .filter((banner) => banner.before !== banner.sortOrder)
    .map(({ id, sortOrder }) => ({ id, sortOrder }));
}
