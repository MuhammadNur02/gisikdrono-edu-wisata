import { setBookingEnabled } from './helpers/booking-flag';

// The booking specs need booking open (tests/e2e/helpers/booking-flag.ts).
export default async function globalSetup(): Promise<void> {
  await setBookingEnabled(true);
}
