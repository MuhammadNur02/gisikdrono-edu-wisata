// node scripts/generate-staging-secrets.mjs [--out <path>] (docs/runbooks/staging-setup.md, part C; Task P0.3.02).
// Writes a fresh set of random staging secrets, plus the blanks the owner fills in from the Supabase, Midtrans and
// Cloudflare dashboards, to one file in .env format OUTSIDE the repository, by default
// %USERPROFILE%\gisikdrono-staging-secrets.txt. Nothing secret is ever printed: stdout names the file only. It refuses
// a path inside the repository and never overwrites a file, so an earlier set is never lost or committed by accident.
// It needs Node alone, no pnpm install. The values are for staging only; production gets its own set (P5.7.01).
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// 32 random bytes each (Task P0.3.02); src/lib/env.ts wants 32 characters or more and 32-byte signing keys.
const SECRET_BYTES = 32;
// The kid of Task P0.3.02; a rotation adds a new kid next to it (docs/Task.md Appendix A).
export const QR_SIGNING_KID = 'k1';
export const DEFAULT_FILE_NAME = 'gisikdrono-staging-secrets.txt';
// Windows ignores the mode; elsewhere only the owner may read the file.
const OWNER_ONLY = 0o600;
export const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));

export function generateStagingSecrets(random = randomBytes) {
  const hex = () => random(SECRET_BYTES).toString('hex');
  return {
    // A path segment of the Midtrans notification URL, so URL-safe base64.
    MIDTRANS_WEBHOOK_PATH_TOKEN: random(SECRET_BYTES).toString('base64url'),
    WHATSAPP_VERIFY_TOKEN: hex(),
    QR_SIGNING_KEYS: JSON.stringify({ [QR_SIGNING_KID]: random(SECRET_BYTES).toString('base64') }),
    QR_SIGNING_ACTIVE_KID: QR_SIGNING_KID,
    BOOKING_LINK_SECRET: hex(),
    OTP_PEPPER: hex(),
    CRON_SECRET: hex(),
  };
}

const SUPABASE_KEYS = 'Supabase > Project Settings > API Keys > Legacy API keys';
const TURNSTILE_WIDGET = 'Cloudflare > Turnstile > widget gisikdrono-staging';
const MIDTRANS_KEYS = 'Midtrans SANDBOX dashboard > Settings > Access Keys';

// Values the owner copies from a dashboard, each with where it comes from (CLAUDE.md §10.2).
export const FILL_IN = [
  ['NEXT_PUBLIC_SITE_URL', 'the unguessable staging address of part B, no slash at the end'],
  ['NEXT_PUBLIC_SUPABASE_URL', 'Supabase > Project Settings > Data API > Project URL'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', `${SUPABASE_KEYS} > anon public`],
  ['SUPABASE_SERVICE_ROLE_KEY', `${SUPABASE_KEYS} > service_role secret`],
  ['NEXT_PUBLIC_TURNSTILE_SITE_KEY', `${TURNSTILE_WIDGET} > Site Key`],
  ['TURNSTILE_SECRET_KEY', `${TURNSTILE_WIDGET} > Secret Key`],
  ['MIDTRANS_SERVER_KEY', `${MIDTRANS_KEYS} > Server Key`],
  ['MIDTRANS_CLIENT_KEY', `${MIDTRANS_KEYS} > Client Key`],
  ['MIDTRANS_MERCHANT_ID', `${MIDTRANS_KEYS} > Merchant ID (G... or M...)`],
  ['NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER', 'the number the kelurahan agreed to, or +6281200000000'],
  ['SECURITY_ALERT_EMAIL', 'your own mailbox for staging alerts'],
  ['SECURITY_ALERT_WA_PHONE', 'your own phone as +628..., for staging alerts'],
];

// The same on every staging setup, and not secret.
export const FIXED = [
  ['MIDTRANS_IS_PRODUCTION', 'false', 'staging is a Preview deployment, held to the sandbox'],
  ['RESEND_API_KEY', 'email-off-on-staging', 'src/lib/env.ts needs a value; email stays off'],
  ['EMAIL_FROM', 'Edu Wisata Gisikdrono Staging <noreply@example.invalid>', 'until Resend'],
];

// Optional names that stay unset on staging; Vercel gets no row for them.
const LEFT_UNSET = [
  'MIDTRANS_SERVER_KEY_PREVIOUS (only during a key rotation)',
  'WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID,',
  '  WHATSAPP_APP_SECRET (WhatsApp stays off)',
  'RESEND_WEBHOOK_SECRET (no Resend yet)',
  'PARTICIPANT_PII_KEYS, PARTICIPANT_PII_ACTIVE_KID (Task P4.5.04)',
  'NEXT_PUBLIC_SENTRY_DSN (Task P0.1.11)',
];

const VAULT_LINES = [
  'environment   = staging',
  'jobs_base_url = the same value as NEXT_PUBLIC_SITE_URL',
  'cron_secret   = the same value as CRON_SECRET',
  'otp_pepper    = the same value as OTP_PEPPER',
];

function header(generatedAt) {
  return [
    `# Gisikdrono STAGING environment, generated ${generatedAt}.`,
    '# 1. Fill in every empty value.  2. pnpm midtrans:check -- --file <this file>',
    '# 3. Paste into Vercel > Settings > Environment Variables: Preview only, Sensitive on.',
    '# 4. Put the four Vault values (end of file) into Supabase.',
    '# 5. Move this file into Bitwarden, then delete it.',
    '# Never commit it or paste it into a chat, an issue or a message. Staging only.',
  ];
}

function section(title, lines) {
  return ['', `# --- ${title} ---`, ...lines];
}

export function renderSecretsFile(generated, generatedAt) {
  const lines = [
    ...header(generatedAt),
    ...section(
      'Generated: random, staging only',
      Object.entries(generated).map(([name, value]) => `${name}=${value}`),
    ),
    ...section(
      'Fill in from the dashboards',
      FILL_IN.flatMap(([name, source]) => [`# ${source}`, `${name}=`]),
    ),
    ...section(
      'Fixed for staging',
      FIXED.flatMap(([name, value, why]) => [`# ${why}`, `${name}=${value}`]),
    ),
    ...section(
      'Left unset on staging (add none of these to Vercel)',
      LEFT_UNSET.map((line) => `# ${line}`),
    ),
    ...section(
      'Supabase Vault (Integrations > Vault > Add new secret), not Vercel',
      VAULT_LINES.map((line) => `#   ${line}`),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function isInside(child, parent) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

export function resolveOutputPath(out, options = {}) {
  const { home = homedir(), repositoryRoot = REPOSITORY_ROOT } = options;
  const target = resolve(out ?? join(home, DEFAULT_FILE_NAME));
  if (isInside(target, resolve(repositoryRoot))) {
    throw new Error(`refusing to write secrets inside the repository (${repositoryRoot})`);
  }
  return target;
}

// 'wx' fails when the file exists, so an earlier set is never overwritten.
export function writeSecretsFile(target, content) {
  writeFileSync(target, content, { flag: 'wx', mode: OWNER_ONLY, encoding: 'utf8' });
}

function describeFailure(error) {
  if (!(error instanceof Error)) return 'unknown error';
  if ('code' in error && error.code === 'EEXIST') {
    return 'that file already exists; move it into Bitwarden and delete it, or pass --out <path>';
  }
  return error.message;
}

function main() {
  const { values } = parseArgs({ options: { out: { type: 'string' } } });
  try {
    const target = resolveOutputPath(values.out);
    const generatedAt = new Date().toISOString();
    writeSecretsFile(target, renderSecretsFile(generateStagingSecrets(), generatedAt));
    process.stdout.write(
      `Wrote the staging secrets to ${target}\n` +
        'No secret was printed. Continue with part C of docs/runbooks/staging-setup.md.\n',
    );
    return 0;
  } catch (error) {
    process.stderr.write(`Nothing written: ${describeFailure(error)}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main();
}
