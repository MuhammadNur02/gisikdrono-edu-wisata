import { Badge } from '@/components/ui/badge';
import { RW_ACCENTS, RW_PROGRAMMES, type RwId } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';

// The RW context chip of the sidebar header (docs/StyleGuide.md §6.1): an RW in its own accent (§2.7, an RW label),
// the kelurahan in neutral.
export function ContextChip({ rwId }: { rwId: RwId | null }) {
  if (rwId === null) return <Badge variant="neutral">{copy.dashboard.kelurahan}</Badge>;
  return <Badge className={cn(RW_ACCENTS[rwId].soft)}>{RW_PROGRAMMES[rwId].label}</Badge>;
}
