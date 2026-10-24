import { setBookingEnabled } from './helpers/booking-flag';
import { E2E_MIDTRANS_STUB_PORT } from './helpers/midtrans';
import { startMidtransStub } from '../fixtures/midtrans-stub';

// The booking specs need booking open (tests/e2e/helpers/booking-flag.ts), and the payment spec the Midtrans stand-in
// (tests/e2e/helpers/midtrans.ts). What this returns, Playwright runs once every spec is done.
export default async function globalSetup(): Promise<() => Promise<void>> {
  await setBookingEnabled(true);
  const stub = await startMidtransStub(E2E_MIDTRANS_STUB_PORT);
  return stub.close;
}
