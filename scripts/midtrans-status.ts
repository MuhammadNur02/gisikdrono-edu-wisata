import { readFileSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';

import { z } from 'zod';

import { midtransApiBaseUrl } from '../src/lib/midtrans/environment';

// pnpm midtrans:status -- --order GSK-7F3K9Q2M-01 [--file .env.local]   (Task P3.8.05)
// What the Status API says of one order, on the host MIDTRANS_IS_PRODUCTION names (or the stand-in of
// MIDTRANS_LOCAL_STUB_URL): its status, fraud status and amount. Nothing printed carries a key.

const DEFAULT_ENV_FILE = '.env.local';
const STATUS_API_TIMEOUT_MS = 10_000;

const envSchema = z.object({
  MIDTRANS_SERVER_KEY: z.string().min(1),
  MIDTRANS_IS_PRODUCTION: z.stringbool(),
  MIDTRANS_LOCAL_STUB_URL: z.url().optional(),
});

function readInputs() {
  const { values } = parseArgs({
    // process.argv starts with the node binary and this script; the options follow.
    args: process.argv.filter((_, index) => index > 1).filter((arg) => arg !== '--'),
    options: { order: { type: 'string' }, file: { type: 'string' } },
  });
  const order = z
    .string()
    .regex(/^GSK-[0-9A-HJKMNP-TV-Z]{8}-[0-9]{2}$/)
    .parse(values.order);
  const entries = Object.entries(parseEnv(readFileSync(values.file ?? DEFAULT_ENV_FILE, 'utf8')));
  const env = envSchema.parse(
    Object.fromEntries(entries.filter(([, value]) => value !== undefined && value !== '')),
  );
  return { order, env };
}

async function main(): Promise<void> {
  const { order, env } = readInputs();
  const host = env.MIDTRANS_LOCAL_STUB_URL ?? midtransApiBaseUrl(env.MIDTRANS_IS_PRODUCTION);
  const response = await fetch(`${host}/v2/${encodeURIComponent(order)}/status`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString('base64')}`,
    },
    signal: AbortSignal.timeout(STATUS_API_TIMEOUT_MS),
  });
  const answer = z
    .looseObject({
      status_code: z.string().optional(),
      status_message: z.string().optional(),
      transaction_status: z.string().optional(),
      fraud_status: z.string().optional(),
      gross_amount: z.string().optional(),
    })
    .parse(await response.json());
  process.stdout.write(
    [
      `${order} on ${new URL(host).host}: HTTP ${String(response.status)}`,
      `status_code ${answer.status_code ?? '-'} (${answer.status_message ?? ''})`,
      `transaction_status ${answer.transaction_status ?? '-'}, fraud_status ${answer.fraud_status ?? '-'}`,
      `gross_amount ${answer.gross_amount ?? '-'}`,
    ].join('\n') + '\n',
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
