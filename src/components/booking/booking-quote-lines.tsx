import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import type { BookingQuote, BookingQuoteLine } from '@/types/booking';

const text = copy.booking.wizard.quote;

function lineDetail(line: BookingQuoteLine): string {
  if (line.kind === 'addon')
    return text.addonLine(formatIDR(line.unitPrice), line.quantity, line.unitLabel);
  return line.pricingBasis === 'flat_group'
    ? text.flatGroup
    : text.perPax(formatIDR(line.unitPrice), line.quantity);
}

// docs/StyleGuide.md §5.14 BookingSummary: the lines of the server's quote and its total, as it priced them; nothing
// here adds a rupiah (docs/PRD.md FR-BOOK-05).
export function BookingQuoteLines({ quote }: { quote: BookingQuote }) {
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border">
        {quote.lines.map((line) => (
          <li
            key={line.kind === 'package' ? line.packageId : line.productId}
            className="flex items-start justify-between gap-4 py-3"
          >
            <span className="min-w-0">
              <span className="block text-body-sm font-medium">{line.name}</span>
              <span className="block text-caption text-muted-foreground tabular-nums">
                {lineDetail(line)}
              </span>
            </span>
            <span className="shrink-0 text-body-sm font-medium tabular-nums">
              {formatIDR(line.lineTotal)}
            </span>
          </li>
        ))}
      </ul>
      <p className="flex items-baseline justify-between gap-4 border-t border-border pt-4">
        <span className="text-body font-semibold">{text.total}</span>
        <span className="text-h2 tabular-nums">{formatIDR(quote.total)}</span>
      </p>
    </div>
  );
}
