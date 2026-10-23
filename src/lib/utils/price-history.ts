import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import type { PriceHistoryEntry } from '@/types/package';

const text = copy.packages.history;
const NONE = '—';

function rupiahOrNone(amount: number | null): string {
  return amount === null ? NONE : formatIDR(amount);
}

function changed(before: number | null, after: number | null): boolean {
  return before !== after;
}

// One line of the package's price history tab (Task P4.3.05, REC-13): what moved, from what to what. A tier's row
// names the tier; a row where no price moved (the basis or the group size changed) says so.
export function describePriceChange(entry: PriceHistoryEntry): string[] {
  const lines: string[] = [];
  if (changed(entry.oldPricePerPax, entry.newPricePerPax)) {
    const line = text.perPax(
      rupiahOrNone(entry.oldPricePerPax),
      rupiahOrNone(entry.newPricePerPax),
    );
    lines.push(entry.tierId === null ? line : `${text.tier}: ${line}`);
  }
  if (changed(entry.oldFlatPrice, entry.newFlatPrice)) {
    lines.push(text.flat(rupiahOrNone(entry.oldFlatPrice), rupiahOrNone(entry.newFlatPrice)));
  }
  return lines.length > 0 ? lines : [text.unknown];
}
