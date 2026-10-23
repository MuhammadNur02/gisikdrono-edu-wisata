import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_FILE_NAME,
  FILL_IN,
  FIXED,
  generateStagingSecrets,
  QR_SIGNING_KID,
  renderSecretsFile,
  REPOSITORY_ROOT,
  resolveOutputPath,
  writeSecretsFile,
} from './generate-staging-secrets.mjs';

// src/lib/env.ts: `secret` is at least 32 characters, every signing key decodes to 32 bytes.
const MIN_SECRET_LENGTH = 32;
const SIGNING_KEY_BYTES = 32;
const GENERATED_AT = '2026-10-23T00:00:00.000Z';
const HEX_SECRETS = ['BOOKING_LINK_SECRET', 'OTP_PEPPER', 'CRON_SECRET', 'WHATSAPP_VERIFY_TOKEN'];
const UNSET_ON_STAGING = [
  'WHATSAPP_ACCESS_TOKEN',
  'MIDTRANS_SERVER_KEY_PREVIOUS',
  'PARTICIPANT_PII_KEYS',
];

function countingRandom() {
  let call = 0;
  return (size) => {
    call += 1;
    return Buffer.alloc(size, call);
  };
}

describe('generateStagingSecrets', () => {
  it('gives every secret src/lib/env.ts requires the shape it checks', () => {
    const secrets = generateStagingSecrets();
    for (const name of HEX_SECRETS) {
      expect(secrets[name]).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(secrets.MIDTRANS_WEBHOOK_PATH_TOKEN).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secrets.MIDTRANS_WEBHOOK_PATH_TOKEN.length).toBeGreaterThanOrEqual(MIN_SECRET_LENGTH);
    expect(secrets.QR_SIGNING_ACTIVE_KID).toBe(QR_SIGNING_KID);
    const keyRing = JSON.parse(secrets.QR_SIGNING_KEYS);
    expect(Object.keys(keyRing)).toEqual([QR_SIGNING_KID]);
    expect(Buffer.from(keyRing[QR_SIGNING_KID], 'base64')).toHaveLength(SIGNING_KEY_BYTES);
  });

  it('draws separate random bytes for every value', () => {
    const secrets = generateStagingSecrets(countingRandom());
    const values = Object.entries(secrets)
      .filter(([name]) => name !== 'QR_SIGNING_ACTIVE_KID')
      .map(([, value]) => value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('never repeats a set', () => {
    expect(generateStagingSecrets()).not.toEqual(generateStagingSecrets());
  });
});

describe('renderSecretsFile', () => {
  const secrets = generateStagingSecrets();
  const parsed = parseEnv(renderSecretsFile(secrets, GENERATED_AT));

  it('reads back as the same values, so pnpm midtrans:check and Vercel get them unchanged', () => {
    for (const [name, value] of Object.entries(secrets)) expect(parsed[name]).toBe(value);
    for (const [name, value] of FIXED) expect(parsed[name]).toBe(value);
  });

  it('leaves every dashboard value empty for the owner and keeps staging on the sandbox', () => {
    for (const [name] of FILL_IN) expect(parsed[name]).toBe('');
    expect(parsed.MIDTRANS_IS_PRODUCTION).toBe('false');
  });

  it('writes no row for the variables staging leaves unset', () => {
    for (const name of UNSET_ON_STAGING) {
      expect(parsed).not.toHaveProperty(name);
    }
  });
});

describe('resolveOutputPath', () => {
  const home = join(tmpdir(), 'someone');

  it('defaults to the home folder', () => {
    expect(resolveOutputPath(undefined, { home })).toBe(join(home, DEFAULT_FILE_NAME));
  });

  it('refuses the repository itself and anything inside it', () => {
    expect(() => resolveOutputPath(REPOSITORY_ROOT)).toThrow(/inside the repository/);
    expect(() => resolveOutputPath(join(REPOSITORY_ROOT, 'docs', 'secrets.txt'))).toThrow(
      /inside the repository/,
    );
  });

  it('accepts a folder whose name only starts like the repository', () => {
    const sibling = `${resolve(REPOSITORY_ROOT)}-secrets.txt`;
    expect(resolveOutputPath(sibling)).toBe(sibling);
  });
});

describe('writeSecretsFile', () => {
  let folder;
  afterEach(() => {
    if (folder !== undefined) rmSync(folder, { recursive: true, force: true });
  });

  it('writes a new file and never overwrites an existing one', () => {
    folder = mkdtempSync(join(tmpdir(), 'staging-secrets-'));
    const target = join(folder, DEFAULT_FILE_NAME);
    writeSecretsFile(target, 'first\n');
    expect(() => writeSecretsFile(target, 'second\n')).toThrow(/EEXIST/);
    expect(readFileSync(target, 'utf8')).toBe('first\n');
  });
});
