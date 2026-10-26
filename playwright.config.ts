import { defineConfig, devices } from '@playwright/test';

const LOCAL_APP_URL = 'http://127.0.0.1:3000';
// CLAUDE.md §8: every screen is checked at 360 px wide.
const SMALLEST_PHONE = { width: 360, height: 800 };
// The sixth-failed-sign-in test (tests/e2e/staff-lockout.spec.ts) counts login limits every other file resets.
const LOCKOUT_SPEC = /staff-lockout\.spec\.ts$/;

export default defineConfig({
  testDir: 'tests/e2e',
  // A failed test also leaves a screenshot, which the CI e2e job uploads with the page screenshots (synthetic data
  // only), so a failure that happens only on the runner can be read without its trace.
  use: { baseURL: LOCAL_APP_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', testIgnore: LOCKOUT_SPEC, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'phone-360',
      testIgnore: LOCKOUT_SPEC,
      use: { ...devices['Pixel 7'], viewport: SMALLEST_PHONE },
    },
    // After every other file, alone: their resets of the login counters cannot land in the middle of it.
    {
      name: 'auth-lockout',
      testMatch: LOCKOUT_SPEC,
      dependencies: ['desktop', 'phone-360'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: { command: 'pnpm start', url: LOCAL_APP_URL, reuseExistingServer: true },
  // Booking is closed on every database until the guest pages exist; the run opens it and closes it again.
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
});
