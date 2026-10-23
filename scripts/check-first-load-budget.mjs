// Fails when a route's first-load JS in the `next build` route table passes its budget (CLAUDE.md §8, Task
// P5.6.01): public pages 170 kB, the booking and staff sign-in forms 250 kB, the dashboard 350 kB. It reads the
// build's output from the file named on the command line, so it runs on the build CI already makes
// (.github/workflows/ci.yml, security job) and needs no second one. Lighthouse (lighthouserc.json) measures the
// served pages on top of this; the table is the deterministic gate.
import { readFileSync } from 'node:fs';

const PUBLIC_BUDGET_KB = 170;
const FORMS_BUDGET_KB = 250;
const DASHBOARD_BUDGET_KB = 350;
// The booking wizard, the status hub and the staff sign-in forms: script-heavy forms outside the public budget.
const FORM_PREFIXES = [
  '/pesan',
  '/reservasi',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/mfa',
  '/onboarding',
];
// Not documents a browser loads: route handlers, generated images, the manifest and the not-found shell.
const SKIPPED_ROUTE = /^\/(api|auth)\/|opengraph-image|^\/manifest\.webmanifest$|^\/_not-found$|^\/(sitemap|robots)/;
const KB_PER_UNIT = { B: 1 / 1024, kB: 1, MB: 1024 };
// A row of the table: `├ ○ /produk/[slug]   1.75 kB   147 kB`, the route, its own size, then the first load.
const ROW = /^\s*[┌├└]\s+[○●ƒ]\s+(\S+)\s+[\d.]+\s*(?:B|kB|MB)\s+([\d.]+)\s*(B|kB|MB)/;
const USAGE_EXIT = 2;

function budgetFor(route) {
  if (route.startsWith('/dashboard')) return DASHBOARD_BUDGET_KB;
  const isForm = FORM_PREFIXES.some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
  return isForm ? FORMS_BUDGET_KB : PUBLIC_BUDGET_KB;
}

function readRows(log) {
  const rows = [];
  for (const line of log.split('\n')) {
    const match = ROW.exec(line);
    if (!match) continue;
    const [, route, size, unit] = match;
    if (SKIPPED_ROUTE.test(route)) continue;
    rows.push({ route, kb: Number(size) * KB_PER_UNIT[unit], budget: budgetFor(route) });
  }
  return rows;
}

function main() {
  const [logPath] = process.argv.slice(2);
  if (!logPath) {
    process.stderr.write('usage: node scripts/check-first-load-budget.mjs <next build log>\n');
    process.exit(USAGE_EXIT);
  }
  const rows = readRows(readFileSync(logPath, 'utf8'));
  if (rows.length === 0) {
    process.stderr.write(`no route table found in ${logPath}\n`);
    process.exit(USAGE_EXIT);
  }
  const over = rows.filter((row) => row.kb > row.budget);
  for (const row of rows) {
    const mark = row.kb > row.budget ? 'OVER' : 'ok  ';
    process.stdout.write(
      `${mark} ${row.route.padEnd(44)} ${String(row.kb).padStart(6)} kB / ${String(row.budget)} kB\n`,
    );
  }
  if (over.length > 0) {
    process.stderr.write(`${String(over.length)} route(s) over the first-load budget\n`);
    process.exit(1);
  }
}

main();
