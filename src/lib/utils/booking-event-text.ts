import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';

const reasons = bookingsAdminCopy.detail.reasons;

function isMachineReason(reason: string): reason is keyof typeof reasons {
  return Object.hasOwn(reasons, reason);
}

// A booking event's reason as staff read it: a known machine reason in words, anything else as it was written.
export function bookingEventReason(reason: string): string {
  return isMachineReason(reason) ? reasons[reason] : reason;
}
