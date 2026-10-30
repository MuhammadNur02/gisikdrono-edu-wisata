import 'server-only';

import { addHours } from 'date-fns';

import { isPrelaunch } from '@/config/launch';
import { computeBookingQuote, type QuoteResult } from '@/lib/pricing/compute-booking-quote';
import { bookingQuoteHash } from '@/lib/pricing/quote-hash';
import { getPackageBySlug } from '@/lib/queries/packages';
import { listAddonProducts } from '@/lib/queries/products';
import { listAvailableSessions } from '@/lib/queries/sessions';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import { bookableRange, sessionStartsAt } from '@/lib/utils/dates';
import type { BookingQuote, WizardPackage } from '@/types/booking';
import type { PackageDetail } from '@/types/package';
import type { AddonProduct } from '@/types/product';
import type { AvailableSession, BookableLeg } from '@/types/session';

// What the booking wizard reads (Task P3.5.01, P3.5.03; docs/PRD.md FR-BOOK-01…05): the package with its legs and
// tiers, the sessions it can book, the add-ons its RWs sell and the quote of what the visitor chose. All of it is
// public data read as a visitor through src/lib/queries, and nothing here writes. internal.create_booking prices the
// booking again itself and refuses one whose quote differs from the summary's (PRICE_MISMATCH).

export interface BookingWizard {
  package: PackageDetail;
  // The add-ons of the RWs the package visits.
  addons: AddonProduct[];
  rules: { minLeadHours: number; maxAdvanceDays: number; maxPax: number };
  // docs/PRD.md FR-BOOK-01: false while booking_enabled is off or the site is under maintenance, and always in a
  // pre-launch build, whatever booking_enabled says (docs/Security.md §8.9).
  isOpen: boolean;
  isPrelaunch: boolean;
}

export async function loadBookingWizard(packageSlug: string): Promise<BookingWizard | null> {
  const [tourPackage, settings, addons] = await Promise.all([
    getPackageBySlug(packageSlug),
    getPublicSiteSettings(),
    listAddonProducts(),
  ]);
  if (!tourPackage) return null;
  const visits = (product: AddonProduct) => tourPackage.rws.some((rw) => rw.id === product.rw.id);
  return {
    package: tourPackage,
    addons: addons.filter(visits),
    rules: {
      minLeadHours: settings.minLeadHours,
      maxAdvanceDays: settings.maxAdvanceDays,
      maxPax: settings.maxPax,
    },
    isOpen: !isPrelaunch() && settings.bookingEnabled && !settings.maintenanceMode,
    isPrelaunch: isPrelaunch(),
  };
}

// What the browser side of the wizard is told about its package: no price, which only the quote gives, and a group
// no larger than both the package and site_settings booking.max_pax allow.
export function wizardPackageOf(wizard: BookingWizard): WizardPackage {
  const tourPackage = wizard.package;
  return {
    id: tourPackage.id,
    slug: tourPackage.slug,
    name: tourPackage.name,
    rws: tourPackage.rws,
    minPax: tourPackage.minPax,
    maxPax: Math.min(tourPackage.maxPax, wizard.rules.maxPax),
    offersAddons: wizard.addons.length > 0,
  };
}

// The visit days the booking rules and the package's own validity both allow, or null when none is left.
function bookableDays(wizard: BookingWizard, now: Date): { from: string; to: string } | null {
  const window = bookableRange({ now, ...wizard.rules });
  const { validFrom, validTo } = wizard.package;
  const from = validFrom && validFrom > window.first ? validFrom : window.first;
  const to = validTo && validTo < window.last ? validTo : window.last;
  return from <= to ? { from, to } : null;
}

// One list of sessions per RW the package visits, in leg order. v_session_availability shows every open session
// from today, so the lead time is applied here to the minute, as internal.booking_sessions applies it.
export async function listBookableSessions(
  wizard: BookingWizard,
  now: Date = new Date(),
): Promise<BookableLeg[]> {
  const days = bookableDays(wizard, now);
  const earliestStart = addHours(now, wizard.rules.minLeadHours);
  const startsInTime = (session: AvailableSession) =>
    sessionStartsAt(session.sessionDate, session.startTime) >= earliestStart;
  return Promise.all(
    wizard.package.rws.map(async (rw) => ({
      rw,
      sessions: days
        ? (await listAvailableSessions({ rwId: rw.id, ...days })).filter(startsInTime)
        : [],
    })),
  );
}

export interface QuoteRequest {
  pax: number;
  addons: readonly { productId: string; qty: number }[];
}

export type QuotePreview =
  { ok: true; quote: BookingQuote; quoteHash: string } | Exclude<QuoteResult, { ok: true }>;

// The summary's price and the fingerprint createBookingAction sends with it (decision of 2026-10-22, Q6).
export function quoteWizardBooking(wizard: BookingWizard, request: QuoteRequest): QuotePreview {
  const tourPackage = wizard.package;
  const result = computeBookingQuote({
    package: {
      id: tourPackage.id,
      name: tourPackage.name,
      pricingBasis: tourPackage.pricingBasis,
      pricePerPax: tourPackage.pricePerPax,
      flatPrice: tourPackage.flatPrice,
      minPax: tourPackage.minPax,
      maxPax: tourPackage.maxPax,
    },
    legs: tourPackage.rws.map((rw) => ({ rwId: rw.id })),
    tiers: tourPackage.priceTiers,
    products: wizard.addons.map((product) => ({
      id: product.id,
      rwId: product.rw.id,
      name: product.name,
      unitLabel: product.unitLabel,
      price: product.price,
      minOrderQty: product.minOrderQty,
      maxOrderQty: product.maxOrderQty,
    })),
    pax: request.pax,
    addons: request.addons,
  });
  if (!result.ok) return result;
  return { ok: true, quote: result.quote, quoteHash: bookingQuoteHash(result.quote) };
}
