import { LinkPending } from '@/components/layout/link-pending';
import { RwEyebrow } from '@/components/layout/rw-eyebrow';
import type { PublicNavItem } from '@/config/nav';

// The pending dot sits in the link's own padding, to the right of the words, so it widens nothing.
const PENDING_CLASS = 'absolute top-1/2 -right-3 -translate-y-1/2';

// An RW link carries its number in the RW accent above the programme name, so the neighbourhoods are told apart
// before the visitor reads the words. Every public nav link (header, footer, mobile menu) renders through here,
// so each shows the pending dot while its page is fetched.
export function NavLinkLabel({ item }: { item: PublicNavItem }) {
  if (item.rw === undefined) {
    return (
      <span className="relative">
        {item.label}
        <LinkPending className={PENDING_CLASS} />
      </span>
    );
  }
  return (
    <span className="relative flex flex-col gap-0.5">
      <RwEyebrow rw={item.rw} />
      <span>{item.label}</span>
      <LinkPending className={PENDING_CLASS} />
    </span>
  );
}
