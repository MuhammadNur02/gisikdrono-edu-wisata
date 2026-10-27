import { toMidtransTime } from '@/lib/utils/dates';

// Task P3.7.02 (docs/Security.md §3.2; PAY-05, PAY-06, PAY-07, BOOK-14): the Snap request of one payment attempt,
// built from database rows only. Every amount is the booking's own snapshot; the PIC is the only person named, by name,
// email and phone, never a participant; the page closes when the hold does; and Snap sends the visitor back to the
// status hub, which reads the database and never the query string (PAY-09).

// QRIS and the bank transfers only: no cards, no e-wallet redirects (CLAUDE.md §7.2).
export const ENABLED_PAYMENTS = [
  'qris',
  'bca_va',
  'bni_va',
  'bri_va',
  'permata_va',
  'cimb_va',
  'other_va',
] as const;

const ITEM_NAME_MAX_LENGTH = 50;
const CUSTOMER_NAME_MAX_LENGTH = 50;
const MS_PER_MINUTE = 60_000;
const DISCOUNT_NAME = 'Potongan harga';

export interface SnapBooking {
  bookingId: string;
  bookingCode: string;
  orderId: string;
  totalAmount: number;
  packageName: string;
  // The package line as the booking priced it: the group as one unit for a flat price, else one per visitor.
  packageQuantity: number;
  packageUnitPrice: number;
  subtotalPackage: number;
  discountAmount: number;
  picName: string;
  picEmail: string;
  picPhone: string;
  expiresAt: string;
}

export interface SnapAddon {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

interface SnapItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface SnapPayload {
  transaction_details: { order_id: string; gross_amount: number };
  item_details: SnapItem[];
  customer_details: { first_name: string; email: string; phone: string };
  enabled_payments: readonly string[];
  expiry: { start_time: string; unit: 'minute'; duration: number };
  callbacks: { finish: string };
  custom_field1: string;
}

// By characters, not code units, so a name never ends in half an emoji.
function shorten(text: string, maxLength: number): string {
  return Array.from(text.trim()).slice(0, maxLength).join('');
}

function packageItem(booking: SnapBooking): SnapItem {
  const name = shorten(booking.packageName, ITEM_NAME_MAX_LENGTH);
  const isPricedPerUnit =
    booking.packageUnitPrice * booking.packageQuantity === booking.subtotalPackage;
  return isPricedPerUnit
    ? { id: 'package', name, price: booking.packageUnitPrice, quantity: booking.packageQuantity }
    : { id: 'package', name, price: booking.subtotalPackage, quantity: 1 };
}

function itemsOf(booking: SnapBooking, addons: readonly SnapAddon[]): SnapItem[] {
  const items = [
    packageItem(booking),
    ...addons.map((addon) => ({
      id: addon.productId,
      name: shorten(addon.name, ITEM_NAME_MAX_LENGTH),
      price: addon.unitPrice,
      quantity: addon.qty,
    })),
  ];
  if (booking.discountAmount > 0) {
    items.push({
      id: 'discount',
      name: DISCOUNT_NAME,
      price: -booking.discountAmount,
      quantity: 1,
    });
  }
  return items;
}

// Midtrans refuses a request whose lines do not add up to gross_amount; the booking's own CHECK guarantees they do,
// so a difference here is a bug to stop at, never an amount to send.
function checkItemsAddUp(items: readonly SnapItem[], totalAmount: number): void {
  const sum = items.reduce((total, item) => total + item.price * item.quantity, 0);
  if (sum !== totalAmount) {
    throw new Error(`Snap items add up to ${String(sum)}, not ${String(totalAmount)}`);
  }
}

// docs/PRD.md §13.1 A23 addendum (delta review of PR #91, L-2a): an officer's hold can run for weeks, but one Snap page
// lives at most 24 hours; a later attempt replaces it, as any new attempt does.
const SNAP_PAGE_MAX_MINUTES = 1440;

function minutesUntil(expiresAt: string, now: Date): number {
  const minutes = Math.floor((new Date(expiresAt).getTime() - now.getTime()) / MS_PER_MINUTE);
  if (minutes < 1) throw new RangeError('The hold has no minute left for a payment page');
  return Math.min(minutes, SNAP_PAGE_MAX_MINUTES);
}

export function buildSnapPayload(
  booking: SnapBooking,
  addons: readonly SnapAddon[],
  context: { siteUrl: string; now: Date },
): SnapPayload {
  const items = itemsOf(booking, addons);
  checkItemsAddUp(items, booking.totalAmount);
  return {
    transaction_details: { order_id: booking.orderId, gross_amount: booking.totalAmount },
    item_details: items,
    customer_details: {
      first_name: shorten(booking.picName, CUSTOMER_NAME_MAX_LENGTH),
      email: booking.picEmail,
      phone: booking.picPhone,
    },
    enabled_payments: ENABLED_PAYMENTS,
    expiry: {
      start_time: toMidtransTime(context.now),
      unit: 'minute',
      duration: minutesUntil(booking.expiresAt, context.now),
    },
    callbacks: {
      finish: new URL(`/reservasi/${booking.bookingCode}`, context.siteUrl).toString(),
    },
    custom_field1: booking.bookingId,
  };
}
