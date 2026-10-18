import { Badge } from '@/components/ui/badge';
import { RW_ACCENTS, RW_PROGRAMMES, type RwId } from '@/config/rw';
import { cn } from '@/lib/utils/cn';

export interface RwTagProps {
  rwId: RwId;
  className?: string;
}

// The RW tag on a card: the soft pair of that RW's accent (docs/StyleGuide.md §2.7).
export function RwTag({ rwId, className }: RwTagProps) {
  return (
    <Badge className={cn('border-transparent', RW_ACCENTS[rwId].soft, className)}>
      {RW_PROGRAMMES[rwId].label}
    </Badge>
  );
}
