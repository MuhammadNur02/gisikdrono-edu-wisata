import { createEnv } from '@t3-oss/env-nextjs';
// zod/mini, not zod: this module reaches the browser through the image loader, and the mini build lets the
// bundler keep only the few checks below instead of the whole library (CLAUDE.md §8 first-load budgets).
import * as z from 'zod/mini';

export const INDONESIAN_MOBILE_E164 = /^\+628\d{7,11}$/;

// The sample numbers in .env.local and CI (+62812000…) carry six zeros in a row, which no number the
// kelurahan publishes does. Production refuses them, so the WhatsApp button can never go live pointing
// at a sample (go-live check #21 confirms the official number on top of this).
const SAMPLE_PHONE_PATTERN = /0{6,}/;

interface PublicEnvValues {
  VERCEL_ENV?: 'production' | 'preview' | 'development' | undefined;
  NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: string;
}

export function findPublicEnvProblems(values: PublicEnvValues): string[] {
  if (values.VERCEL_ENV !== 'production') return [];
  if (!SAMPLE_PHONE_PATTERN.test(values.NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER)) return [];
  return [
    'NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER looks like a sample number; production needs the kelurahan number',
  ];
}

// Kept apart from src/lib/env.ts because that module is server-only and client components need these.
// Next.js inlines NEXT_PUBLIC_* only when each one is read by its literal name, hence the long list below.
export const publicEnv = createEnv({
  client: {
    NEXT_PUBLIC_SITE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().check(z.minLength(1)),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().check(z.minLength(1)),
    NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: z.string().check(z.regex(INDONESIAN_MOBILE_E164)),
    NEXT_PUBLIC_SENTRY_DSN: z.optional(z.url()),
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
