import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { PriceTier } from '@/types/package';

// docs/PRD.md FR-BOOK-05: the quote the summary step shows and the prices internal.create_booking snapshots into
// bookings.package_snapshot and booking_addons. Every amount is integer rupiah (CLAUDE.md §7.1).

export interface PackageQuoteLine {
  kind: 'package';
  packageId: string;
  name: string;
  // The RWs the package visits, in leg order.
  rwIds: RwId[];
  pricingBasis: EnumValue<'pricing_basis'>;
  // The volume tier the price per person came from; null for the package's own price and for a flat group price.
  tier: PriceTier | null;
  unitPrice: number;
  // Visitors for a price per person, 1 for a flat group price.
  quantity: number;
  lineTotal: number;
}

export interface AddonQuoteLine {
  kind: 'addon';
  productId: string;
  vendorId: string;
  rwId: RwId;
  name: string;
  unitLabel: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export type BookingQuoteLine = PackageQuoteLine | AddonQuoteLine;

// The package line comes first, then one line per add-on, and total is the sum of every lineTotal.
export interface BookingQuote {
  lines: [PackageQuoteLine, ...AddonQuoteLine[]];
  total: number;
}
