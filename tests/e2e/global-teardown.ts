import { setBookingEnabled } from './helpers/booking-flag';

// Back to the state every database starts in (20261023090000), which pgTAP's schema_seed.sql checks.
export default async function globalTeardown(): Promise<void> {
  await setBookingEnabled(false);
}
