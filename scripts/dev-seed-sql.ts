import { readFileSync } from 'node:fs';

// The SQL pnpm db:seed runs in one transaction (scripts/seed-dev.ts), and tests/integration/seed-convergence.test.ts
// with it: the development accounts first, then the demo content, which the staging release also writes on its own
// (.github/workflows/staging-db.yml).
const DEV_SEED_FILES = ['./seed-dev.sql', './seed-demo-content.sql'];

export function devSeedSql(): string {
  const files = DEV_SEED_FILES.map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'));
  return files.join('\n');
}
