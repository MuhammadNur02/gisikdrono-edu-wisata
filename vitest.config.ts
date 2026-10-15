import { defineConfig } from 'vitest/config';

// CLAUDE.md §9.1: pricing, QR, guest links and the booking state map stay at 100 % lines, file by file.
const FULL_LINE_COVERAGE = { lines: 100, perFile: true };

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' },
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
