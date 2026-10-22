import { runSql } from '../../../scripts/local-stack';

// Booking is closed on every database until the guest pages exist (20261023090000; review of PR #27, N1). A run that
// books switches it on for the local stack through the service role, and off again afterwards, so pgTAP's seed check
// still holds. The public settings are cached when the app is built (src/lib/queries/settings.ts, an hour), so the CI
// e2e job switches it on before `pnpm build` as well; Playwright's global setup covers a server that outlives that hour.
export async function setBookingEnabled(isOn: boolean): Promise<void> {
  await runSql(
    `update public.site_settings set value = to_jsonb(${isOn ? 'true' : 'false'}) where key = 'booking_enabled'`,
  );
}
