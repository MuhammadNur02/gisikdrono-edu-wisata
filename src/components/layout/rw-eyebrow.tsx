import { RW_ACCENTS, RW_PROGRAMMES, type RwId } from '@/config/rw';
import { cn } from '@/lib/utils/cn';

export interface RwEyebrowProps {
  rwId: RwId;
  // Adds the programme name after the number: `RW 05 · Ecowastreme`.
  withName?: boolean;
  className?: string;
}

// The RW label is one of the few places an RW accent belongs (docs/StyleGuide.md §2.7).
export function RwEyebrow({ rwId, withName = false, className }: RwEyebrowProps) {
  const programme = RW_PROGRAMMES[rwId];
  return (
    <span className={cn('text-overline', RW_ACCENTS[rwId].text, className)}>
      {withName ? `${programme.label} · ${programme.name}` : programme.label}
    </span>
  );
}
