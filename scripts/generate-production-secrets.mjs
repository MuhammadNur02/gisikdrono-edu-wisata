// node scripts/generate-production-secrets.mjs [--out <path>] (docs/runbooks/production-setup.md, part 1 step 5;
// Task P5.7.01). The production twin of generate-staging-secrets.mjs, for the pre-launch phase (docs/Security.md
// §8.9): a fresh set of random values drawn on this machine, never copied from staging, plus the blanks the owner fills
// in from the production dashboards, written in .env format to one file OUTSIDE the repository, by default
// %USERPROFILE%\gisikdrono-production-secrets.txt. Nothing secret is printed, a path inside the repository is refused
// and an existing file is never overwritten. It needs Node alone, no pnpm install.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import {
  generateStagingSecrets,
  resolveOutputPath,
  writeSecretsFile,
} from './generate-staging-secrets.mjs';

export const PRODUCTION_FILE_NAME = 'gisikdrono-production-secrets.txt';

// The random values have the same shapes on every environment; only where they go differs.
export const generateProductionSecrets = generateStagingSecrets;

const SUPABASE_KEYS = 'Supabase gisikdrono-prod > Project Settings > API Keys > Legacy API keys';
const TURNSTILE_WIDGET = 'Cloudflare > Turnstile > widget gisikdrono-production';

export const PRODUCTION_FILL_IN = [
  ['NEXT_PUBLIC_SITE_URL', 'https://<domain>, the real domain, no slash at the end'],
  [
    'NEXT_PUBLIC_SUPABASE_URL',
    'Supabase gisikdrono-prod > Project Settings > Data API > Project URL',
  ],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', `${SUPABASE_KEYS} > anon public`],
  ['SUPABASE_SERVICE_ROLE_KEY', `${SUPABASE_KEYS} > service_role secret`],
  ['NEXT_PUBLIC_TURNSTILE_SITE_KEY', `${TURNSTILE_WIDGET} > Site Key`],
  ['TURNSTILE_SECRET_KEY', `${TURNSTILE_WIDGET} > Secret Key`],
  [
    'RESEND_API_KEY',
    'Resend > API Keys > a new key for production only (Sending access, domain mail.<domain>)',
  ],
  ['EMAIL_FROM', 'for example Edu Wisata Gisikdrono <noreply@mail.<domain>>'],
  [
    'NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER',
    'the official kelurahan number as +628...; production refuses a sample',
  ],
  ['SECURITY_ALERT_EMAIL', 'the operator mailbox that receives production security alerts'],
  ['SECURITY_ALERT_WA_PHONE', 'the operator phone as +628..., for production alerts'],
];

// Fixed for the pre-launch phase; Part 2 of the runbook changes them at launch.
export const PRODUCTION_FIXED = [
  ['MIDTRANS_IS_PRODUCTION', 'true', 'production always says true, even before it has keys'],
  ['NEXT_PUBLIC_FLAG_PRELAUNCH', 'on', 'booking and payment closed in code until launch'],
  ['NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS', 'off', 'Supabase Free has no image transformer'],
];

const LEFT_UNSET = [
  'MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY, MIDTRANS_MERCHANT_ID (added at launch, after pnpm midtrans:check)',
  'MIDTRANS_SERVER_KEY_PREVIOUS (only during a key rotation)',
  'WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID,',
  '  WHATSAPP_APP_SECRET (added at launch)',
  'RESEND_WEBHOOK_SECRET, PARTICIPANT_PII_KEYS, PARTICIPANT_PII_ACTIVE_KID, NEXT_PUBLIC_SENTRY_DSN',
];

const VAULT_LINES = [
  'environment   = production',
  'jobs_base_url = the same value as NEXT_PUBLIC_SITE_URL',
  'cron_secret   = the same value as CRON_SECRET',
  'otp_pepper    = the same value as OTP_PEPPER',
];

function section(title, lines) {
  return ['', `# --- ${title} ---`, ...lines];
}

export function renderProductionSecretsFile(generated, generatedAt) {
  const lines = [
    `# Gisikdrono PRODUCTION environment (pre-launch), generated ${generatedAt}.`,
    '# 1. Fill in every empty value.  2. Paste into Vercel > Settings > Environment Variables:',
    '#    Production only, Sensitive on.  3. Put the four Vault values (end of file) into Supabase.',
    '# 4. Move this file into Bitwarden, then delete it.',
    '# Never commit it, never paste it into a chat, an issue or a message, never reuse it for staging.',
    ...section(
      'Generated: random, production only',
      Object.entries(generated).map(([name, value]) => `${name}=${value}`),
    ),
    ...section(
      'Fill in from the production dashboards',
      PRODUCTION_FILL_IN.flatMap(([name, source]) => [`# ${source}`, `${name}=`]),
    ),
    ...section(
      'Fixed for pre-launch',
      PRODUCTION_FIXED.flatMap(([name, value, why]) => [`# ${why}`, `${name}=${value}`]),
    ),
    ...section(
      'Left unset in pre-launch (add none of these to Vercel)',
      LEFT_UNSET.map((line) => `# ${line}`),
    ),
    ...section(
      'Supabase Vault (Integrations > Vault > Add new secret), not Vercel',
      VAULT_LINES.map((line) => `#   ${line}`),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function main() {
  try {
    const { values } = parseArgs({ options: { out: { type: 'string' } } });
    const target = resolveOutputPath(values.out ?? join(homedir(), PRODUCTION_FILE_NAME));
    const content = renderProductionSecretsFile(
      generateProductionSecrets(),
      new Date().toISOString(),
    );
    writeSecretsFile(target, content);
    process.stdout.write(
      `Wrote the production secrets to ${target}\n` +
        'No secret was printed. Continue with part 1 of docs/runbooks/production-setup.md.\n',
    );
    return 0;
  } catch (error) {
    const reason =
      error instanceof Error && 'code' in error && error.code === 'EEXIST'
        ? 'that file already exists; move it into Bitwarden and delete it, or pass --out <path>'
        : error instanceof Error
          ? error.message
          : 'unknown error';
    process.stderr.write(`Nothing written: ${reason}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main();
}
