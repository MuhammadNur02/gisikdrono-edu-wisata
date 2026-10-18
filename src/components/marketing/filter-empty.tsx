import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy/id';

export interface FilterEmptyProps {
  message: string;
  onClear: () => void;
}

// The answer to a visitor's own filter, the one public empty state that speaks (docs/StyleGuide.md §6.9).
export function FilterEmpty({ message, onClear }: FilterEmptyProps) {
  return (
    <div
      role="status"
      className="space-y-3 rounded-xl border border-dashed border-border p-6 text-center"
    >
      <p className="text-body text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onClear}>
        {copy.catalogue.clearFilters}
      </Button>
    </div>
  );
}
