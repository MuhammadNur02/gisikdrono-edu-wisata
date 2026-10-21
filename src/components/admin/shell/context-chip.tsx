import { Badge } from '@/components/ui/badge';
import { rwAccentClasses } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import type { RwBadge } from '@/types/rw-unit';

// The RW context chip of the sidebar header (docs/StyleGuide.md §6.1): an RW in its own accent (§2.7, an RW label),
// the kelurahan in neutral.
export function ContextChip({ rw }: { rw: RwBadge | null }) {
  if (rw === null) return <Badge variant="neutral">{copy.dashboard.kelurahan}</Badge>;
  return <Badge className={cn(rwAccentClasses(rw.accentKey).soft)}>{rw.label}</Badge>;
}
