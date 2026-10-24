import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { sandboxEnv } from '../tests/fixtures/env';

// What the local Next.js server runs with, for the tools that must agree with it: the value in .env.local, or without
// that file (or that name in it) the fixture value CI builds and serves the app with. pnpm db:seed copies CRON_SECRET
// into Vault as cron_secret, since the scanner's attestation key derives from it on both sides
// (20261026090000_scanner_attestation.sql, src/lib/scanner/attest.ts); the scanner specs sign test tickets with the
// QR key the server checks them with.
const LOCAL_ENV_FILE = '.env.local';

type ServerSecretName = 'CRON_SECRET' | 'QR_SIGNING_KEYS' | 'QR_SIGNING_ACTIVE_KID';

export function localServerSecret(name: ServerSecretName, envFile = LOCAL_ENV_FILE): string {
  if (!existsSync(envFile)) return sandboxEnv[name];
  return parseEnv(readFileSync(envFile, 'utf8'))[name] ?? sandboxEnv[name];
}

export function localCronSecret(): string {
  return localServerSecret('CRON_SECRET');
}
