import { LinkPending } from '@/components/layout/link-pending';
import type { PublicNavItem } from '@/config/nav';

// The pending dot sits in the link's own padding, to the right of the words, so it widens nothing.
const PENDING_CLASS = 'absolute top-1/2 -right-3 -translate-y-1/2';

// A nav link's words with the pending dot that shows while its page is fetched. Every public nav link (header, menu
// drawer, footer) renders through here; `label` replaces the item's own words, as the drawer and the footer do for an
// RW (`RW 05 · Ecowastreme`).
export function NavLinkLabel({ item, label }: { item: PublicNavItem; label?: string }) {
  return (
    <span className="relative">
      {label ?? item.label}
      <LinkPending className={PENDING_CLASS} />
    </span>
  );
}
