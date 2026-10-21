import type { LucideIcon } from 'lucide-react';

import { softClassesFor } from '@/config/rw';
import { cn } from '@/lib/utils/cn';
import type { RwBadge } from '@/types/rw-unit';

export interface PhotoPlaceholderProps {
  // What the photo will show, read out by screen readers in place of the missing image.
  label: string;
  // The category or RW icon of docs/StyleGuide.md §8.1.
  icon: LucideIcon;
  // One RW tints the slot with its soft accent; none (kelurahan) or several (a combo) keep it neutral.
  rws: readonly RwBadge[];
  // A small slot, such as the 80 px product square on the hero, takes a smaller icon.
  iconClassName?: string;
  className?: string;
}

// docs/StyleGuide.md §1.3 G1 (decision of 2026-10-18): until a real Gisikdrono photo exists the slot holds no
// stand-in picture and no words, only the tinted background and the icon of what it is about. To assistive
// technology it is an image with a plain description.
export function PhotoPlaceholder({
  label,
  icon,
  rws,
  iconClassName,
  className,
}: PhotoPlaceholderProps) {
  const Icon = icon;
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('flex items-center justify-center rounded-xl', softClassesFor(rws), className)}
    >
      <Icon aria-hidden className={cn('size-10 opacity-70', iconClassName)} strokeWidth={1.5} />
    </div>
  );
}
