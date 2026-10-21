import { rwAccentClasses } from '@/config/rw';
import { cn } from '@/lib/utils/cn';
import type { RwEyebrowData } from '@/types/rw-unit';

export interface RwEyebrowProps {
  rw: RwEyebrowData;
  // Adds the programme name after the number: `RW 05 · Ecowastreme`.
  withName?: boolean;
  className?: string;
}

// The RW label is one of the few places an RW accent belongs (docs/StyleGuide.md §2.7).
export function RwEyebrow({ rw, withName = false, className }: RwEyebrowProps) {
  return (
    <span className={cn('text-overline', rwAccentClasses(rw.accentKey).text, className)}>
      {withName ? `${rw.label} · ${rw.shortName}` : rw.label}
    </span>
  );
}
