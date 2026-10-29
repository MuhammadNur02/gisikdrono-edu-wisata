import { parseEnv } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  generateProductionSecrets,
  PRODUCTION_FILL_IN,
  PRODUCTION_FIXED,
  renderProductionSecretsFile,
} from './generate-production-secrets.mjs';

const GENERATED_AT = '2026-10-29T00:00:00.000Z';
// docs/Security.md §8.9: none of these is set before launch, so the file carries no row for them.
const UNSET_IN_PRELAUNCH = [
  'MIDTRANS_SERVER_KEY',
  'MIDTRANS_CLIENT_KEY',
  'MIDTRANS_MERCHANT_ID',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_APP_SECRET',
  'MIDTRANS_SERVER_KEY_PREVIOUS',
];

describe('renderProductionSecretsFile', () => {
  const secrets = generateProductionSecrets();
  const parsed = parseEnv(renderProductionSecretsFile(secrets, GENERATED_AT));

  it('reads back as the same freshly drawn values', () => {
    for (const [name, value] of Object.entries(secrets)) expect(parsed[name]).toBe(value);
    expect(generateProductionSecrets().CRON_SECRET).not.toBe(secrets.CRON_SECRET);
  });

  it('is a pre-launch production: Midtrans production, booking closed, images untransformed', () => {
    for (const [name, value] of PRODUCTION_FIXED) expect(parsed[name]).toBe(value);
    expect(parsed.MIDTRANS_IS_PRODUCTION).toBe('true');
    expect(parsed.NEXT_PUBLIC_FLAG_PRELAUNCH).toBe('on');
  });

  it('leaves every dashboard value empty and writes no Midtrans or WhatsApp credential', () => {
    for (const [name] of PRODUCTION_FILL_IN) expect(parsed[name]).toBe('');
    for (const name of UNSET_IN_PRELAUNCH) expect(parsed).not.toHaveProperty(name);
  });
});
