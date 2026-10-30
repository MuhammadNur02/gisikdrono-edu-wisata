import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { ActionResult } from '@/types/action-result';
import type { OtpRequestAnswer, OtpVerifyAnswer } from '@/types/guest';
import type { PriceTier } from '@/types/package';
import type { RwBadge } from '@/types/rw-unit';
import type { BookableLeg } from '@/types/session';

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

// What the wizard's browser side knows of its package (Task P3.5.01). No price: the server's quote gives every one.
export interface WizardPackage {
  id: string;
  slug: string;
  name: string;
  // The RWs it visits, in leg order: one session each.
  rws: RwBadge[];
  minPax: number;
  // The smaller of the package's max_pax and site_settings booking.max_pax.
  maxPax: number;
  // Whether any product of its RWs is on sale as an add-on. Since the decision of 2026-10-29 none is (UMKM products are
  // ordered from the Koperasi Merah Putih), so the wizard leaves out its Tambahan step.
  offersAddons: boolean;
}

// previewQuoteAction's answer (Task P3.5.03): the quote with the fingerprint the summary sends, or what the catalogue
// does not allow, which the wizard turns into words.
export type QuotePreviewAnswer =
  | { kind: 'quote'; quote: BookingQuote; quoteHash: string }
  | { kind: 'problem'; problem: 'pax_out_of_range' }
  | {
      kind: 'problem';
      problem: 'addon_unavailable' | 'addon_quantity_out_of_range';
      productId: string;
    };

// createBookingAction's answers (Task P3.5.04). Only a created booking carries its code, with the page to go on to;
// a duplicate's code is never told (BOOK-15). reverify asks for the WhatsApp code again, since internal.create_booking
// takes one at most ten minutes old (decision of 2026-10-22 on P3.5, Q2).
export type BookingSubmitAnswer =
  | { kind: 'created'; bookingCode: string; nextUrl: string }
  | { kind: 'resent' }
  | { kind: 'pay_to_confirm' }
  | { kind: 'reverify' };

// The Server Actions the wizard page hands its browser side (src/server/actions/booking.ts and otp.ts).
export interface WizardActions {
  listSessions: (input: unknown) => Promise<ActionResult<BookableLeg[]>>;
  previewQuote: (input: unknown) => Promise<ActionResult<QuotePreviewAnswer>>;
  createBooking: (input: unknown) => Promise<ActionResult<BookingSubmitAnswer>>;
  requestQuotation: (input: unknown) => Promise<ActionResult<BookingSubmitAnswer>>;
  requestOtp: (input: unknown) => Promise<ActionResult<OtpRequestAnswer>>;
  verifyOtp: (input: unknown) => Promise<ActionResult<OtpVerifyAnswer>>;
}
