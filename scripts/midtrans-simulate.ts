import { readFileSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';

import { z } from 'zod';

import { SIMULATED_STATUSES, simulatedNotification } from './midtrans-notification';

// pnpm midtrans:simulate -- --order GSK-7F3K9Q2M-01 --status settlement|pending|deny|expire|cancel|refund
//   [--amount 1250000] [--file .env.local]   (Task P3.8.05, docs/PRD.md §10.1)
// Posts a correctly signed sandbox notification to the webhook of the server on this machine. The webhook asks the
// Status API before it applies anything but a pending status, so a simulated settlement passes only against the
// stand-in of MIDTRANS_LOCAL_STUB_URL, which this script tells how the order now stands; against the real sandbox, pay
// the order on Midtrans' own simulator instead. Production keys and any server off this machine are refused, and
// nothing printed carries a key or the path token.

const DEFAULT_ENV_FILE = '.env.local';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

const envSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  MIDTRANS_SERVER_KEY: z.string().min(1),
  MIDTRANS_MERCHANT_ID: z.string().min(1),
  MIDTRANS_WEBHOOK_PATH_TOKEN: z.string().min(1),
  MIDTRANS_IS_PRODUCTION: z.stringbool(),
  MIDTRANS_LOCAL_STUB_URL: z.url().optional(),
});

const argsSchema = z.object({
  order: z.string().regex(/^GSK-[0-9A-HJKMNP-TV-Z]{8}-[0-9]{2}$/),
  status: z.enum(SIMULATED_STATUSES),
  amount: z.string().regex(/^\d+$/).optional(),
  file: z.string().default(DEFAULT_ENV_FILE),
});

function readArgs() {
  const { values } = parseArgs({
    // process.argv starts with the node binary and this script; the options follow.
    args: process.argv.filter((_, index) => index > 1).filter((arg) => arg !== '--'),
    options: {
      order: { type: 'string' },
      status: { type: 'string' },
      amount: { type: 'string' },
      file: { type: 'string' },
    },
  });
  return argsSchema.parse(values);
}

function readEnv(envFile: string) {
  const entries = Object.entries(parseEnv(readFileSync(envFile, 'utf8')));
  const env = envSchema.parse(
    Object.fromEntries(entries.filter(([, value]) => value !== undefined && value !== '')),
  );
  if (env.MIDTRANS_IS_PRODUCTION)
    throw new Error('midtrans:simulate signs sandbox notifications only');
  if (!LOOPBACK_HOSTS.has(new URL(env.NEXT_PUBLIC_SITE_URL).hostname)) {
    throw new Error('midtrans:simulate posts only to a server on this machine');
  }
  return env;
}

// The amount Midtrans would send: --amount, or what the stand-in recorded when the Snap page was made.
async function stubOrder(stubUrl: string | undefined, orderId: string) {
  if (stubUrl === undefined) return null;
  const response = await fetch(`${stubUrl}/__stub/orders/${encodeURIComponent(orderId)}`);
  if (!response.ok) return null;
  return z
    .object({ grossAmount: z.string(), transactionId: z.string() })
    .parse(await response.json());
}

async function main(): Promise<void> {
  const args = readArgs();
  const env = readEnv(args.file);
  const recorded = await stubOrder(env.MIDTRANS_LOCAL_STUB_URL, args.order);
  const grossAmount = args.amount === undefined ? recorded?.grossAmount : `${args.amount}.00`;
  if (grossAmount === undefined)
    throw new Error('give --amount, or make the order through the stand-in first');
  if (env.MIDTRANS_LOCAL_STUB_URL !== undefined && recorded !== null) {
    await fetch(`${env.MIDTRANS_LOCAL_STUB_URL}/__stub/orders/${encodeURIComponent(args.order)}`, {
      method: 'POST',
      body: JSON.stringify({ transactionStatus: args.status }),
    });
  }
  const notification = simulatedNotification({
    orderId: args.order,
    status: args.status,
    grossAmount,
    transactionId: recorded?.transactionId,
    serverKey: env.MIDTRANS_SERVER_KEY,
    merchantId: env.MIDTRANS_MERCHANT_ID,
  });
  const webhook = new URL(
    `/api/webhooks/midtrans/${env.MIDTRANS_WEBHOOK_PATH_TOKEN}`,
    env.NEXT_PUBLIC_SITE_URL,
  );
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(notification),
  });
  process.stdout.write(
    `${args.status} for ${args.order}: HTTP ${String(response.status)} ${await response.text()}\n`,
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
