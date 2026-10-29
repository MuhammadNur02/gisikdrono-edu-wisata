import { argv, env } from 'node:process';
import { parseArgs } from 'node:util';

import { accessChecks } from './security-probe-access';
import { createProbe, type ProbeResult } from './security-probe-client';
import { surfaceChecks } from './security-probe-surface';

// pnpm security:probe -- --url <base URL>   (or STAGING_URL=<base URL> pnpm security:probe)
// Task P5.2.02, the part a visitor without a session can run (docs/security-tests.md §1): every refusal of the
// security smoke and every header of docs/Security.md §8.2, asked of a deployment over HTTPS. It reads no secret,
// signs nobody in, creates no booking, OTP or message, and paces its ~80 requests (security-probe-client.ts).
// The output names paths only, never the host, so it can be pasted into the repository as it is. The base URL is a
// command-line value for this tool, not application configuration, hence node:process rather than src/lib/env.ts.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
// process.argv starts with the node binary and this script; the options follow.
const SCRIPT_ARGS_START = 2;

function baseUrlFromArgs(): URL {
  const { values } = parseArgs({
    // pnpm passes a `--` through when the caller writes one.
    args: argv.slice(SCRIPT_ARGS_START).filter((arg) => arg !== '--'),
    options: { url: { type: 'string' } },
  });
  const raw = values.url ?? env['STAGING_URL'];
  if (raw === undefined || !URL.canParse(raw)) {
    throw new Error('pass --url <base URL> or set STAGING_URL');
  }
  const url = new URL(raw);
  if (url.protocol !== 'https:' && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error('the base URL must be https (or a local development host)');
  }
  return new URL(url.origin);
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
  const probe = createProbe(baseUrlFromArgs());
  const results: ProbeResult[] = [];
  for (const check of [...accessChecks(probe), ...surfaceChecks(probe)]) {
    results.push(await check());
  }
  if (report(results) > 0) process.exitCode = 1;
}

await main();
