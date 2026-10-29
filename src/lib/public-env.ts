import { createEnv } from '@t3-oss/env-nextjs';
// zod/mini, not zod: this module reaches the browser through the image loader, and the mini build lets the
// bundler keep only the few checks below instead of the whole library (CLAUDE.md §8 first-load budgets).
import * as z from 'zod/mini';

// Relative, not @/: next.config.ts loads this file before the path alias exists.
import { MOBILE_PHONE_PATTERN } from './utils/phone';

// The sample numbers in .env.local and CI (+62812000…) carry six zeros in a row, which no number the
// kelurahan publishes does. Production refuses them, so the WhatsApp button can never go live pointing
// at a sample (go-live check #21 confirms the official number on top of this).
const SAMPLE_PHONE_PATTERN = /0{6,}/;

// Cloudflare's published Turnstile test keys, site and secret alike (1x… pass, 2x… block, 3x… challenge or fail):
// they let every visitor through, so only a local or CI server may use them (review of PR #20, info).
export const TURNSTILE_TEST_KEY_PATTERN = /^[123]x0+[A-F]{2}$/;

type VercelEnv = 'production' | 'preview' | 'development' | undefined;

// A Vercel deployment real visitors reach; `vercel dev` and servers off Vercel are not one.
export function isHostedDeployment(vercelEnv: VercelEnv): vercelEnv is 'production' | 'preview' {
  return vercelEnv === 'production' || vercelEnv === 'preview';
}

interface PublicEnvValues {
  VERCEL_ENV?: VercelEnv;
  NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: string;
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: string;
  NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS?: 'on' | 'off' | undefined;
  NEXT_PUBLIC_FLAG_PRELAUNCH?: 'on' | 'off' | undefined;
}

export function findPublicEnvProblems(values: PublicEnvValues): string[] {
  const problems: string[] = [];
  const { VERCEL_ENV: vercelEnv } = values;
  if (
    vercelEnv === 'production' &&
    SAMPLE_PHONE_PATTERN.test(values.NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER)
  ) {
    problems.push(
      'NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER looks like a sample number; production needs the kelurahan number',
    );
  }
  if (
    isHostedDeployment(vercelEnv) &&
    TURNSTILE_TEST_KEY_PATTERN.test(values.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  ) {
    problems.push(
      `NEXT_PUBLIC_TURNSTILE_SITE_KEY is one of Cloudflare's test keys, which let every visitor through; ${vercelEnv} needs the site's own key`,
    );
  }
  // Only a Free-plan project goes without the transformer: staging, and production while it is pre-launch on the free
  // plans (docs/Security.md §8.9). A launched production runs on Pro and resizes images (docs/PRD.md A3).
  if (
    vercelEnv === 'production' &&
    values.NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS === 'off' &&
    values.NEXT_PUBLIC_FLAG_PRELAUNCH !== 'on'
  ) {
    problems.push(
      'NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS=off is for a Free-plan project (staging, or production in pre-launch); a launched production resizes images',
    );
  }
  return problems;
}

// Kept apart from src/lib/env.ts because that module is server-only and client components need these.
// Next.js inlines NEXT_PUBLIC_* only when each one is read by its literal name, hence the long list below.
export const publicEnv = createEnv({
  client: {
    NEXT_PUBLIC_SITE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().check(z.minLength(1)),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().check(z.minLength(1)),
    NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: z.string().check(z.regex(MOBILE_PHONE_PATTERN)),
    NEXT_PUBLIC_SENTRY_DSN: z.optional(z.url()),
    // Build-time flag (src/config/images.ts): off serves photos without Supabase's transformer.
    NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS: z.optional(z.enum(['on', 'off'])),
    // Build-time flag (src/config/launch.ts): on keeps booking and payments closed (docs/Security.md §8.9).
    NEXT_PUBLIC_FLAG_PRELAUNCH: z.optional(z.enum(['on', 'off'])),
  },
  // Set by Node and Vercel, not by us. VERCEL_ENV is only defined on the server side.
  shared: {
    NODE_ENV: z._default(z.enum(['development', 'test', 'production']), 'development'),
    VERCEL_ENV: z.optional(z.enum(['production', 'preview', 'development'])),
  },
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: process.env.NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS: process.env.NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS,
    NEXT_PUBLIC_FLAG_PRELAUNCH: process.env.NEXT_PUBLIC_FLAG_PRELAUNCH,
  },
  emptyStringAsUndefined: true,
  // VERCEL_ENV is undefined in the browser, so the check only bites on the server and at build time.
  createFinalSchema: (shape) =>
    z.object(shape).check(
      z.superRefine((values, ctx) => {
        for (const problem of findPublicEnvProblems(values)) {
          ctx.addIssue({ code: 'custom', message: problem, input: values });
        }
      }),
    ),
});
