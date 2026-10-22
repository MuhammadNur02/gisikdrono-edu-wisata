import { defineConfig, devices } from '@playwright/test';

const LOCAL_APP_URL = 'http://127.0.0.1:3000';
// CLAUDE.md §8: every screen is checked at 360 px wide.
const SMALLEST_PHONE = { width: 360, height: 800 };

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: LOCAL_APP_URL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone-360', use: { ...devices['Pixel 7'], viewport: SMALLEST_PHONE } },
  ],
  webServer: { command: 'pnpm start', url: LOCAL_APP_URL, reuseExistingServer: true },
  // Booking is closed on every database until the guest pages exist; the run opens it and closes it again.
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
});
