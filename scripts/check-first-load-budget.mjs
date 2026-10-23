// Fails when a route's first-load JS in the `next build` route table passes its budget (CLAUDE.md §8, Task
// P5.6.01): public pages 170 kB; the booking wizard, the guest status hub and the auth and MFA forms 250 kB
// (decision of 2026-10-23, docs/StyleGuide.md §10.1); the dashboard 350 kB. It also fails when the table lacks one
// of the anchor routes, which means a failed or partial build. It reads the build's output from the file named on
// the command line, so it runs on the build CI already makes (.github/workflows/ci.yml, security job) and needs
// no second one. Lighthouse (lighthouserc.json) measures the served pages on top of this; the table is the
// deterministic gate.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PUBLIC_BUDGET_KB = 170;
export const FORMS_BUDGET_KB = 250;
export const DASHBOARD_BUDGET_KB = 350;
const FORM_PREFIXES = [
  '/pesan',
  '/reservasi',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/mfa',
  '/onboarding',
];
// Routes the table must list, one per budget: a log without them is not a full build.
export const ANCHOR_ROUTES = ['/', '/paket-wisata', '/pesan/[packageSlug]', '/dashboard'];
// Not documents a browser loads: route handlers, generated images, the manifest and the not-found shell.
const SKIPPED_ROUTE =
  /^\/(api|auth)\/|opengraph-image|^\/manifest\.webmanifest$|^\/_not-found$|^\/(sitemap|robots)/;
const KB_PER_UNIT = { B: 1 / 1024, kB: 1, MB: 1024 };
// A row of the table: `├ ○ /produk/[slug]   1.75 kB   147 kB`, the route, its own size, then the first load.
const ROW = /^\s*[┌├└]\s+[○●ƒ]\s+(\S+)\s+[\d.]+\s*(?:B|kB|MB)\s+([\d.]+)\s*(B|kB|MB)/;
const OVER_EXIT = 1;
const USAGE_EXIT = 2;

export function budgetFor(route) {
  if (route.startsWith('/dashboard')) return DASHBOARD_BUDGET_KB;
  const isForm = FORM_PREFIXES.some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
  return isForm ? FORMS_BUDGET_KB : PUBLIC_BUDGET_KB;
}

// Every page row of the table with its first-load size in kB and its budget.
export function readRows(log) {
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

// The anchor routes the table does not list.
export function missingAnchors(rows) {
  const routes = new Set(rows.map((row) => row.route));
  return ANCHOR_ROUTES.filter((route) => !routes.has(route));
}

export function overBudget(rows) {
  return rows.filter((row) => row.kb > row.budget);
}

function formatRow(row, isOver) {
  const mark = isOver ? 'OVER' : 'ok  ';
  return `${mark} ${row.route.padEnd(44)} ${String(row.kb).padStart(6)} kB / ${String(row.budget)} kB\n`;
}

// The verdict on one build log: the exit code, the report for stdout and the error for stderr.
export function checkBuildLog(log, logPath) {
  const rows = readRows(log);
  const missing = missingAnchors(rows);
  if (missing.length > 0) {
    const error = `route table in ${logPath} lacks ${missing.join(', ')}: not a full build\n`;
    return { exitCode: USAGE_EXIT, report: '', error };
  }
  const over = overBudget(rows);
  const report = rows.map((row) => formatRow(row, over.includes(row))).join('');
  if (over.length === 0) return { exitCode: 0, report, error: '' };
  const error = `${String(over.length)} route(s) over the first-load budget\n`;
  return { exitCode: OVER_EXIT, report, error };
}

function main() {
  const [logPath] = process.argv.slice(2);
  if (!logPath) {
    process.stderr.write('usage: node scripts/check-first-load-budget.mjs <next build log>\n');
    return USAGE_EXIT;
  }
  const { exitCode, report, error } = checkBuildLog(readFileSync(logPath, 'utf8'), logPath);
  process.stdout.write(report);
  process.stderr.write(error);
  return exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main();
}
