import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';

import { z } from 'zod';

import {
  findMidtransKeyProblems,
  MIDTRANS_MERCHANT_ID_PATTERN,
  midtransApiBaseUrl,
  readKeyCheckAnswer,
} from '../src/lib/midtrans/environment';

// pnpm midtrans:check [-- --file <path>] (docs/Security.md §3.9): asks the Midtrans Status API about an order
// that cannot exist, on the host MIDTRANS_IS_PRODUCTION names. "Transaction doesn't exist" proves the server key
// belongs to that environment; 401 means that host does not know the key (it comes from the other environment, or
// it is mistyped or revoked), and the check fails. The key prefix cannot tell the environments apart any more, since
// newer sandbox keys start with Mid-server- like live ones. The values come from the env file only (by default
// .env.local), so the keys an operator is about to put into Vercel can be checked first. Nothing printed here
// contains a key.

const DEFAULT_ENV_FILE = '.env.local';
const STATUS_API_TIMEOUT_MS = 10_000;

const midtransEnvSchema = z.object({
  MIDTRANS_SERVER_KEY: z.string().min(1),
  MIDTRANS_SERVER_KEY_PREVIOUS: z.string().min(1).optional(),
  MIDTRANS_CLIENT_KEY: z.string().min(1),
  MIDTRANS_IS_PRODUCTION: z.stringbool(),
  MIDTRANS_MERCHANT_ID: z.string().regex(MIDTRANS_MERCHANT_ID_PATTERN),
});

type MidtransEnv = z.infer<typeof midtransEnvSchema>;

function envFileFromArgs(args: string[]): string {
  const { values } = parseArgs({
    args: args.filter((arg) => arg !== '--'),
    options: { file: { type: 'string' } },
  });
  return values.file ?? DEFAULT_ENV_FILE;
}

// Empty lines such as MIDTRANS_SERVER_KEY_PREVIOUS= count as unset, the way src/lib/env.ts reads them.
function readMidtransEnv(envFile: string): MidtransEnv {
  const entries = Object.entries(parseEnv(readFileSync(envFile, 'utf8')));
  const setValues = Object.fromEntries(
    entries.filter(([, value]) => value !== undefined && value !== ''),
  );
  const parsed = midtransEnvSchema.safeParse(setValues);
  if (!parsed.success) {
    // Paths and messages only: an issue never carries the value it refused.
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(
      `${envFile} is not a valid Midtrans configuration:\n  ${problems.join('\n  ')}`,
    );
  }
  return parsed.data;
}

function assertKeyFormats(env: MidtransEnv): void {
  const problems = findMidtransKeyProblems(
    {
      serverKey: env.MIDTRANS_SERVER_KEY,
      previousServerKey: env.MIDTRANS_SERVER_KEY_PREVIOUS,
      clientKey: env.MIDTRANS_CLIENT_KEY,
    },
    env.MIDTRANS_IS_PRODUCTION,
  );
  if (problems.length > 0) throw new Error(problems.join('\n'));
}

// Only MIDTRANS_SERVER_KEY is asked about: during a rotation the previous key may already be revoked.
async function askStatusApi(env: MidtransEnv, baseUrl: string): Promise<Response> {
  const orderId = `key-check-${randomUUID()}`;
  const credentials = Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString('base64');
  return fetch(`${baseUrl}/v2/${orderId}/status`, {
    headers: { Accept: 'application/json', Authorization: `Basic ${credentials}` },
    signal: AbortSignal.timeout(STATUS_API_TIMEOUT_MS),
  });
}

async function main(): Promise<number> {
  // process.argv starts with the node binary and this script; the options follow.
  const [, , ...scriptArgs] = process.argv;
  const envFile = envFileFromArgs(scriptArgs);
  const env = readMidtransEnv(envFile);
  assertKeyFormats(env);

  const environmentName = env.MIDTRANS_IS_PRODUCTION ? 'production' : 'sandbox';
  const baseUrl = midtransApiBaseUrl(env.MIDTRANS_IS_PRODUCTION);
  const response = await askStatusApi(env, baseUrl);
  const body: unknown = await response.json().catch(() => null);
  const answer = readKeyCheckAnswer(response.status, body);
  const reply = `${answer.statusCode} ${answer.statusMessage}`.trim();

  if (answer.outcome === 'key_matches') {
    process.stdout.write(
      `MIDTRANS_SERVER_KEY from ${envFile} is a ${environmentName} key (${baseUrl}: ${reply}).\n`,
    );
    return 0;
  }
  if (answer.outcome === 'key_refused') {
    process.stderr.write(
      `${baseUrl} refused MIDTRANS_SERVER_KEY from ${envFile} (${reply}): Midtrans ${environmentName} does not know this key. ` +
        `It comes from the other Midtrans environment, MIDTRANS_IS_PRODUCTION is wrong, or the key is mistyped or revoked; ` +
        `copy it again from the ${environmentName} dashboard and check MIDTRANS_IS_PRODUCTION. Save nothing until this passes.\n`,
    );
    return 1;
  }
  process.stderr.write(
    `${baseUrl} gave an unexpected answer (HTTP ${String(response.status)}, ${reply}).\n`,
  );
  return 1;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
