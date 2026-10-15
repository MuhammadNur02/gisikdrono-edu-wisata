import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { sandboxEnv } from './tests/fixtures/env';

// CLAUDE.md §9.1: pricing, QR, guest links and the booking state map stay at 100 % lines, file by file.
const FULL_LINE_COVERAGE = { lines: 100, perFile: true };

// Next.js swaps server-only for an empty module on the server; tests run on the server too.
const serverOnlyStub = fileURLToPath(
  new URL('./node_modules/server-only/empty.js', import.meta.url),
);

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { 'server-only': serverOnlyStub },
  },
  test: {
    env: sandboxEnv,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/db/types.ts'],
      thresholds: {
        'src/lib/pricing/**': FULL_LINE_COVERAGE,
        'src/lib/qr/**': FULL_LINE_COVERAGE,
        'src/lib/links/**': FULL_LINE_COVERAGE,
        'src/server/services/booking-state.ts': FULL_LINE_COVERAGE,
      },
    },
  },
});
