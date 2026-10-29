import { parseArgs } from 'node:util';

import { accessChecks } from './security-probe-access';
import { createProbe, type Probe, type ProbeResult } from './security-probe-client';
import { isNoIndex } from './security-probe-rules';
import { surfaceChecks } from './security-probe-surface';

// pnpm security:probe -- --url "$STAGING_URL" [--production]
// Task P5.2.02, the part a visitor without a session can run (docs/security-tests.md §2): every refusal of the
// security smoke and every header of docs/Security.md §8.2, asked of a deployment over HTTPS. It reads no secret,
// signs nobody in, creates no booking, OTP or message, and paces its ~80 requests (security-probe-client.ts).
// The output names paths only, never the host, so it can be pasted into the repository as it is. The base URL comes
// from the command line only: it stays in the caller's own shell and is never read from the environment.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
// process.argv starts with the node binary and this script; the options follow.
const SCRIPT_ARGS_START = 2;

interface ProbeOptions {
  base: URL;
  isProduction: boolean;
}

function optionsFromArgs(): ProbeOptions {
  const { values } = parseArgs({
    // pnpm passes a `--` through when the caller writes one.
    args: process.argv.slice(SCRIPT_ARGS_START).filter((arg) => arg !== '--'),
    options: { url: { type: 'string' }, production: { type: 'boolean', default: false } },
  });
  if (values.url === undefined || !URL.canParse(values.url)) {
    throw new Error('pass --url <base URL>');
  }
  const url = new URL(values.url);
  if (url.protocol !== 'https:' && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error('the base URL must be https (or a local development host)');
  }
  return { base: new URL(url.origin), isProduction: values.production };
}

// A preview deployment sends noindex on every response (next.config.ts); production does not on public pages. A
// target without it is probed only when the caller says it is production, so its headers are judged as production's.
async function assertPreviewUnlessProduction(probe: Probe): Promise<void> {
  if (probe.isProduction) return;
  const home = await probe.request('/');
  if (!isNoIndex(home.headers)) {
    throw new Error(
      '/ carries no X-Robots-Tag: noindex, so this is not a preview; pass --production to probe it',
    );
  }
}

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

// FAIL when a problem was found, WARN when only a state to review was (it does not fail the run), PASS otherwise.
function verdictOf({ problems, warnings = [] }: ProbeResult): 'PASS' | 'WARN' | 'FAIL' {
  if (problems.length > 0) return 'FAIL';
  return warnings.length > 0 ? 'WARN' : 'PASS';
}

function printResult(entry: ProbeResult): void {
  const suffix = entry.note === undefined ? '' : `  [${entry.note}]`;
  print(`${verdictOf(entry)}  ${entry.name}${suffix}`);
  for (const problem of entry.problems) print(`        - ${problem}`);
  for (const warning of entry.warnings ?? []) print(`        ~ ${warning}`);
}

function report(results: readonly ProbeResult[]): number {
  for (const entry of results) printResult(entry);
  const count = (verdict: string) => results.filter((entry) => verdictOf(entry) === verdict).length;
  const failed = count('FAIL');
  print(
    `\n${String(count('PASS'))} passed, ${String(count('WARN'))} warned, ${String(failed)} failed, ${String(results.length)} checks`,
  );
  return failed;
}

async function main(): Promise<void> {
  const { base, isProduction } = optionsFromArgs();
  const probe = createProbe(base, isProduction);
  await assertPreviewUnlessProduction(probe);
  const results: ProbeResult[] = [];
  for (const check of [...accessChecks(probe), ...surfaceChecks(probe)]) {
    results.push(await check());
  }
  if (report(results) > 0) process.exitCode = 1;
}

await main();
