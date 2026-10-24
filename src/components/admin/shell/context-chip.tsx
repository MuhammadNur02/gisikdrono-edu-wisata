import { RwTag } from '@/components/layout/rw-tag';
import { Badge } from '@/components/ui/badge';
import { copy } from '@/lib/copy/id';
import type { RwBadge } from '@/types/rw-unit';

// The RW context chip of the sidebar header (docs/StyleGuide.md §6.1): an RW in its own accent (§2.7, an RW label),
// the kelurahan in neutral. The dense size, so it shares the 264 px header with the wordmark.
export function ContextChip({ rw }: { rw: RwBadge | null }) {
  if (rw === null) {
    return (
      <Badge variant="neutral" size="sm">
        {copy.dashboard.kelurahan}
      </Badge>
    );
  }
  return <RwTag rw={rw} size="sm" />;
}
