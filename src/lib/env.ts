import 'server-only';

import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

import {
  findLocalStubProblems,
  findMidtransKeyProblems,
  MIDTRANS_MERCHANT_ID_PATTERN,
} from '@/lib/midtrans/environment';
import { isHostedDeployment, publicEnv, TURNSTILE_TEST_KEY_PATTERN } from '@/lib/public-env';
import { QR_KID_PATTERN } from '@/lib/qr/kid';
import { MOBILE_PHONE_PATTERN } from '@/lib/utils/phone';

const MIN_SECRET_LENGTH = 32;
const SIGNING_KEY_BYTES = 32;

// The only NEXT_PUBLIC_ names allowed to look like a key; both are meant to be public.
const KNOWN_PUBLIC_KEY_NAMES = new Set([
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
]);
const SECRET_LOOKING_NAME = /SECRET|KEY|TOKEN/;

const secret = z.string().min(MIN_SECRET_LENGTH);

const signingKeyRing = z
  .string()
  .transform((raw, ctx) => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'must be JSON shaped like {"k1":"<base64>"}' });
      return z.NEVER;
    }
  })
  .pipe(
    z.record(
      z.string().min(1),
      z.base64().refine((key) => Buffer.from(key, 'base64').length === SIGNING_KEY_BYTES, {
        message: `every key must decode to ${String(SIGNING_KEY_BYTES)} bytes`,
      }),
    ),
  );

type EnvValues = {
  VERCEL_ENV?: 'production' | 'preview' | 'development' | undefined;
  MIDTRANS_IS_PRODUCTION: boolean;
  MIDTRANS_SERVER_KEY: string;
  MIDTRANS_SERVER_KEY_PREVIOUS?: string | undefined;
  MIDTRANS_CLIENT_KEY: string;
  MIDTRANS_LOCAL_STUB_URL?: string | undefined;
  QR_SIGNING_KEYS: Record<string, string>;
  QR_SIGNING_ACTIVE_KID: string;
  PARTICIPANT_PII_KEYS?: Record<string, string> | undefined;
  PARTICIPANT_PII_ACTIVE_KID?: string | undefined;
  WHATSAPP_ACCESS_TOKEN?: string | undefined;
  WHATSAPP_PHONE_NUMBER_ID?: string | undefined;
  WHATSAPP_APP_SECRET?: string | undefined;
  TURNSTILE_SECRET_KEY: string;
};

// CLAUDE.md §7.7: production never runs a sandbox "SB-" key, and MIDTRANS_IS_PRODUCTION follows the deployment.
// A newer sandbox key looks exactly like a live one, so pnpm midtrans:check asks the Status API before keys are
// saved for staging or production (docs/Security.md §3.9).
function findMidtransMismatches(values: EnvValues): string[] {
  const isProductionDeployment = values.VERCEL_ENV === 'production';
  const mismatches = findMidtransKeyProblems(
    {
      serverKey: values.MIDTRANS_SERVER_KEY,
      previousServerKey: values.MIDTRANS_SERVER_KEY_PREVIOUS,
      clientKey: values.MIDTRANS_CLIENT_KEY,
    },
    isProductionDeployment,
  );

  if (values.MIDTRANS_IS_PRODUCTION !== isProductionDeployment) {
    mismatches.push(
      `MIDTRANS_IS_PRODUCTION must be ${String(isProductionDeployment)} when VERCEL_ENV is ${values.VERCEL_ENV ?? 'unset'}`,
    );
  }
  return mismatches;
}

function findKeyRingProblems(values: EnvValues): string[] {
  const problems: string[] = [];
  if (!(values.QR_SIGNING_ACTIVE_KID in values.QR_SIGNING_KEYS)) {
    problems.push('QR_SIGNING_ACTIVE_KID must name a kid that exists in QR_SIGNING_KEYS');
  }
  // The kid goes into every QR token and tickets_qr.key_id, which refuse any other spelling; caught here, not by the
  // first settlement.
  if (!QR_KID_PATTERN.test(values.QR_SIGNING_ACTIVE_KID)) {
    problems.push('QR_SIGNING_ACTIVE_KID must be lowercase letters and digits only');
  }
  const piiKid = values.PARTICIPANT_PII_ACTIVE_KID;
  if (piiKid !== undefined && !(piiKid in (values.PARTICIPANT_PII_KEYS ?? {}))) {
    problems.push('PARTICIPANT_PII_ACTIVE_KID must name a kid that exists in PARTICIPANT_PII_KEYS');
  }
  return problems;
}

// docs/Security.md §8.5: previews use a WhatsApp stub, so the real credentials are only demanded in production.
function findMissingProductionSecrets(values: EnvValues): string[] {
  if (values.VERCEL_ENV !== 'production') return [];
  const whatsappSecrets = {
    WHATSAPP_ACCESS_TOKEN: values.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: values.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_APP_SECRET: values.WHATSAPP_APP_SECRET,
  };
  return Object.entries(whatsappSecrets)
    .filter(([, value]) => value === undefined)
    .map(([name]) => `${name} is required in production`);
}

// src/lib/public-env.ts refuses the test site key on the same deployments.
function findTurnstileTestSecret(values: EnvValues): string[] {
  const vercelEnv = values.VERCEL_ENV;
  if (!isHostedDeployment(vercelEnv)) return [];
  if (!TURNSTILE_TEST_KEY_PATTERN.test(values.TURNSTILE_SECRET_KEY)) return [];
  return [
    `TURNSTILE_SECRET_KEY is one of Cloudflare's test keys, which let every visitor through; ${vercelEnv} needs the site's own secret`,
  ];
}

export function findEnvProblems(values: EnvValues): string[] {
  return [
    ...findMidtransMismatches(values),
    ...findLocalStubProblems(values.MIDTRANS_LOCAL_STUB_URL, values.VERCEL_ENV),
    ...findKeyRingProblems(values),
    ...findMissingProductionSecrets(values),
    ...findTurnstileTestSecret(values),
  ];
}

export function findLeakyPublicNames(variableNames: readonly string[]): string[] {
  return variableNames.filter(
    (name) =>
      name.startsWith('NEXT_PUBLIC_') &&
      SECRET_LOOKING_NAME.test(name) &&
      !KNOWN_PUBLIC_KEY_NAMES.has(name),
  );
}

const leakyPublicNames = findLeakyPublicNames(Object.keys(process.env));
if (leakyPublicNames.length > 0) {
  throw new Error(
    `These NEXT_PUBLIC_ variables look like secrets and would ship to the browser: ${leakyPublicNames.join(', ')}`,
  );
}

export const serverEnv = createEnv({
  server: {
    VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    MIDTRANS_SERVER_KEY: z.string().min(1),
    MIDTRANS_SERVER_KEY_PREVIOUS: z.string().min(1).optional(),
    MIDTRANS_CLIENT_KEY: z.string().min(1),
    MIDTRANS_IS_PRODUCTION: z.stringbool(),
    MIDTRANS_MERCHANT_ID: z.string().regex(MIDTRANS_MERCHANT_ID_PATTERN),
    MIDTRANS_WEBHOOK_PATH_TOKEN: secret,
    MIDTRANS_LOCAL_STUB_URL: z.url().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
    WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1).optional(),
    WHATSAPP_APP_SECRET: z.string().min(1).optional(),
    WHATSAPP_VERIFY_TOKEN: secret,
    RESEND_API_KEY: z.string().min(1),
    RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1),
    QR_SIGNING_KEYS: signingKeyRing,
    QR_SIGNING_ACTIVE_KID: z.string().min(1),
    BOOKING_LINK_SECRET: secret,
    OTP_PEPPER: secret,
    PARTICIPANT_PII_KEYS: signingKeyRing.optional(),
    PARTICIPANT_PII_ACTIVE_KID: z.string().min(1).optional(),
    CRON_SECRET: secret,
    TURNSTILE_SECRET_KEY: z.string().min(1),
    SECURITY_ALERT_EMAIL: z.email(),
    SECURITY_ALERT_WA_PHONE: z.string().regex(MOBILE_PHONE_PATTERN),
  },
  extends: [publicEnv],
  experimental__runtimeEnv: {},
  emptyStringAsUndefined: true,
  createFinalSchema: (shape) =>
    z.object(shape).superRefine((values, ctx) => {
      for (const problem of findEnvProblems(values)) {
        ctx.addIssue({ code: 'custom', message: problem });
      }
    }),
});
