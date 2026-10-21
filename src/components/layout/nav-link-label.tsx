import { RwEyebrow } from '@/components/layout/rw-eyebrow';
import type { PublicNavItem } from '@/config/nav';

// An RW link carries its number in the RW accent above the programme name, so the neighbourhoods are told apart
// before the visitor reads the words.
export function NavLinkLabel({ item }: { item: PublicNavItem }) {
  if (item.rw === undefined) return <span>{item.label}</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <RwEyebrow rw={item.rw} />
      <span>{item.label}</span>
    </span>
  );
}
