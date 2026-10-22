import { setBookingEnabled } from '../tests/e2e/helpers/booking-flag';

// `pnpm exec tsx scripts/e2e-booking-flag.ts on|off`: opens or closes booking on the local stack. The CI e2e job runs
// it before `pnpm build`, since the public settings are cached when the app is built (tests/e2e/helpers/booking-flag.ts).
// It reaches the local stack only (scripts/local-stack.ts refuses anything else).
const mode = process.argv[2];
if (mode !== 'on' && mode !== 'off') throw new Error('usage: e2e-booking-flag.ts on|off');
void setBookingEnabled(mode === 'on');
