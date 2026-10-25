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
      <ul className="space-y-3">
        {quote.lines.map((line) => (
          <li
            key={line.kind === 'package' ? line.packageId : line.productId}
            className="flex items-start justify-between gap-6 text-body"
          >
            <span className="min-w-0 flex-1 md:flex md:items-baseline md:gap-6">
              <span className="block text-foreground md:flex-1">{line.name}</span>
              <span className="block text-body-sm text-muted-foreground tabular-nums">
                {lineDetail(line)}
              </span>
            </span>
            <span className="shrink-0 text-right font-semibold tabular-nums md:w-32">
              {formatIDR(line.lineTotal)}
            </span>
          </li>
        ))}
      </ul>
      <p className="flex items-baseline justify-between gap-4 border-t border-border-strong pt-4">
        <span className="text-label-lg font-semibold text-foreground">{text.total}</span>
        <span className="text-h2 font-display font-extrabold tabular-nums">
          {formatIDR(quote.total)}
        </span>
      </p>
    </div>
  );
}
