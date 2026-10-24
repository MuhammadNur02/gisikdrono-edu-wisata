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
  // A short visible line under the icon, such as `Foto menyusul` on a product card (DESIGN-SPEC §2.5).
  note?: string;
  // A small slot, such as the 80 px product square on the hero, takes a smaller icon.
  iconClassName?: string;
  className?: string;
}

// docs/StyleGuide.md §1.3 G1 (decision of 2026-10-18, DESIGN-SPEC §2.5): until a real Gisikdrono photo exists the slot
// holds no stand-in picture, only the RW's tint with the ink kawung at 8 %, the icon of what it is about in the RW's
// accent and, where the card asks for it, a short note. To assistive technology it is an image with a plain
// description; the note is part of the picture.
export function PhotoPlaceholder({
  label,
  icon,
  rws,
  note,
  iconClassName,
  className,
}: PhotoPlaceholderProps) {
  const Icon = icon;
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        'kawung flex flex-col items-center justify-center gap-2.5 rounded-lg kawung-8 kawung-ink',
        softClassesFor(rws),
        className,
      )}
    >
      <Icon aria-hidden className={cn('size-9', iconClassName)} strokeWidth={1.75} />
      {note ? <span className="text-caption font-medium">{note}</span> : null}
    </div>
  );
}
