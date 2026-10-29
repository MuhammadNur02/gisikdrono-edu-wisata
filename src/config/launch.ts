import { publicEnv } from '@/lib/public-env';

// docs/Security.md §8.9 (decision of 2026-10-29): NEXT_PUBLIC_FLAG_PRELAUNCH=on is the pre-launch phase, a production
// site on the free plans with no Midtrans and no WhatsApp yet. While it is on, booking, holds, OTP codes and payment
// attempts are closed in code whatever site_settings.booking_enabled says, the Midtrans webhook answers 404 and the
// Midtrans client calls out to nobody. Closing is honoured wherever the flag is set; the key checks it relaxes in
// src/lib/env.ts are relaxed on VERCEL_ENV=production only. Unset or "off" is a launched site with every check, and any
// other value stops the build (src/lib/public-env.ts).
export function isPrelaunchFlag(flag: 'on' | 'off' | undefined): boolean {
  return flag === 'on';
}

export function isPrelaunch(): boolean {
  return isPrelaunchFlag(publicEnv.NEXT_PUBLIC_FLAG_PRELAUNCH);
}
