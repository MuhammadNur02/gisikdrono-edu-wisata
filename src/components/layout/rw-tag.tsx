import { Badge } from '@/components/ui/badge';
import { rwAccentClasses } from '@/config/rw';
import { cn } from '@/lib/utils/cn';
import type { RwBadge } from '@/types/rw-unit';

export interface RwTagProps {
  rw: RwBadge;
  className?: string;
}

// The RW tag on a card: the soft pair of that RW's accent (docs/StyleGuide.md §2.7).
export function RwTag({ rw, className }: RwTagProps) {
  return (
    <Badge className={cn('border-transparent', rwAccentClasses(rw.accentKey).soft, className)}>
      {rw.label}
    </Badge>
  );
}
