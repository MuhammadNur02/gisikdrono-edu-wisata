import 'server-only';

import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { AddonQuoteLine, BookingQuote, PackageQuoteLine } from '@/types/booking';
import type { PriceTier } from '@/types/package';

// docs/PRD.md FR-BOOK-05, docs/Security.md §3.2 (PAY-03, PAY-11): every rupiah of a booking is computed here, from
// catalogue rows and the quantities the visitor chose, never from a price the browser sent. Pure and kept at 100 %
// line coverage (CLAUDE.md §4 no. 13); internal.create_booking computes the same lines again inside its transaction
// and raises PRICE_MISMATCH when they differ.

export interface QuotedPackage {
  id: string;
  name: string;
  pricingBasis: EnumValue<'pricing_basis'>;
  pricePerPax: number | null;
  flatPrice: number | null;
  minPax: number;
  maxPax: number;
}

export interface QuotedProduct {
  id: string;
  rwId: RwId;
  name: string;
  unitLabel: string;
  price: number;
  minOrderQty: number;
  maxOrderQty: number | null;
}

export interface BookingQuoteInput {
  package: QuotedPackage;
  // tour_package_legs of the package, in leg order.
  legs: readonly { rwId: RwId }[];
  tiers: readonly PriceTier[];
  // The products on sale as add-ons (published, add-on eligible, available), as the service read them.
  products: readonly QuotedProduct[];
  pax: number;
  addons: readonly { productId: string; qty: number }[];
}

type AddonProblem = {
  ok: false;
  problem: 'addon_unavailable' | 'addon_quantity_out_of_range';
  productId: string;
};

// A visitor's choice that the catalogue does not allow is an answer, not an error: the wizard says what to change.
export type QuoteResult =
  { ok: true; quote: BookingQuote } | { ok: false; problem: 'pax_out_of_range' } | AddonProblem;

// A flat price buys the whole group as one unit.
const ONE_GROUP = 1;

// Whole rupiah, never negative, and small enough that every sum stays exact.
function rupiah(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError('Money must be a whole, non-negative number of rupiah.');
  }
  return amount;
}

function lineTotalOf(unitPrice: number, quantity: number): number {
  return rupiah(rupiah(unitPrice) * quantity);
}

// tour_packages_price_ok gives a package the price its pricing basis needs, so a missing one is a broken row.
function requirePrice(price: number | null): number {
  if (price === null) throw new Error('The package has no price for its pricing basis.');
  return price;
}

// tour_package_price_tiers never overlap, so at most one tier covers the group; without one, the package's own price
// per person applies.
function tierFor(tiers: readonly PriceTier[], pax: number): PriceTier | null {
  const covers = (tier: PriceTier) =>
    tier.minPax <= pax && (tier.maxPax === null || pax <= tier.maxPax);
  return tiers.find(covers) ?? null;
}

function quotePackage(input: BookingQuoteInput): PackageQuoteLine {
  const { package: tourPackage, pax } = input;
  const line = {
    kind: 'package' as const,
    packageId: tourPackage.id,
    name: tourPackage.name,
    rwIds: input.legs.map((leg) => leg.rwId),
    pricingBasis: tourPackage.pricingBasis,
  };
  if (tourPackage.pricingBasis === 'flat_group') {
    const unitPrice = requirePrice(tourPackage.flatPrice);
    return {
      ...line,
      tier: null,
      unitPrice,
      quantity: ONE_GROUP,
      lineTotal: lineTotalOf(unitPrice, ONE_GROUP),
    };
  }
  const tier = tierFor(input.tiers, pax);
  const unitPrice = tier?.pricePerPax ?? requirePrice(tourPackage.pricePerPax);
  return { ...line, tier, unitPrice, quantity: pax, lineTotal: lineTotalOf(unitPrice, pax) };
}

// An add-on comes from an RW the package visits, in a quantity the vendor takes.
function quoteAddon(
  input: BookingQuoteInput,
  request: { productId: string; qty: number },
): AddonQuoteLine | AddonProblem {
  const { productId, qty } = request;
  const product = input.products.find((candidate) => candidate.id === productId);
  if (!product || !input.legs.some((leg) => leg.rwId === product.rwId)) {
    return { ok: false, problem: 'addon_unavailable', productId };
  }
  if (qty < product.minOrderQty || (product.maxOrderQty !== null && qty > product.maxOrderQty)) {
    return { ok: false, problem: 'addon_quantity_out_of_range', productId };
  }
  return {
    kind: 'addon',
    productId,
    rwId: product.rwId,
    name: product.name,
    unitLabel: product.unitLabel,
    unitPrice: product.price,
    quantity: qty,
    lineTotal: lineTotalOf(product.price, qty),
  };
}

// The invariant bookings_total_ok holds in the database: total = sum(lines) > 0.
function totalOf(lines: BookingQuote['lines']): number {
  const total = rupiah(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  if (total === 0) throw new RangeError('A booking must cost more than zero rupiah.');
  return total;
}

export function computeBookingQuote(input: BookingQuoteInput): QuoteResult {
  const { minPax, maxPax } = input.package;
  if (input.pax < minPax || input.pax > maxPax) return { ok: false, problem: 'pax_out_of_range' };

  const addonLines: AddonQuoteLine[] = [];
  for (const request of input.addons) {
    const line = quoteAddon(input, request);
    if ('problem' in line) return line;
    addonLines.push(line);
  }
  const lines: BookingQuote['lines'] = [quotePackage(input), ...addonLines];
  return { ok: true, quote: { lines, total: totalOf(lines) } };
}
