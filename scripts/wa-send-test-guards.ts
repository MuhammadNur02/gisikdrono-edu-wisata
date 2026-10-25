import { z } from 'zod';

// The guards of pnpm wa:send-test (scripts/wa-send-test.ts; reviews of PR #66, M1 and the re-review Lows L-A, L-B),
// kept apart so they are tested without sending anything: the env file is never production's, its Supabase is this
// machine's or the staging project it names, and a document URL is a signed URL of our own documents bucket only.

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
export const SIGNED_DOCUMENTS_PATH = '/storage/v1/object/sign/documents/';
const SIGNED_URL_TOKEN = 'token';
// Encoded dots and slashes have no business in our own signed URL; refusing them outright leaves no way for a
// storage server that decodes them later to climb out of the documents bucket.
const ENCODED_TRAVERSAL = /%2e|%2f|%5c/i;

export const envSchema = z.object({
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  // Read as src/lib/env.ts reads them, so 1, TRUE or yes count as production too.
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  MIDTRANS_IS_PRODUCTION: z.stringbool().optional(),
  STAGING_PROJECT_REF: z
    .string()
    .regex(/^[a-z]{20}$/)
    .optional(),
});
export type ScriptEnv = z.infer<typeof envSchema>;

// Only this machine's stack, or the staging project the file itself names, never production.
export function testEnvironmentOf(values: Record<string, string | undefined>): ScriptEnv {
  const present = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== ''),
  );
  const env = envSchema.parse(present);
  if (env.VERCEL_ENV === 'production' || env.MIDTRANS_IS_PRODUCTION === true) {
    throw new Error('wa:send-test refuses production settings');
  }
  const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;
  const isStaging =
    env.STAGING_PROJECT_REF !== undefined && host === `${env.STAGING_PROJECT_REF}.supabase.co`;
  if (!LOOPBACK_HOSTS.has(host) && !isStaging) {
    throw new Error(
      'wa:send-test runs against this machine or the staging project named by STAGING_PROJECT_REF only',
    );
  }
  return env;
}

// A signed URL of our own documents bucket: the same origin as our Supabase, a path that stays under the bucket's
// signed prefix once the URL parser has resolved it, no encoded dot or slash anywhere, and a token.
export function isOwnDocumentUrl(raw: string, supabaseUrl: string): boolean {
  if (ENCODED_TRAVERSAL.test(raw)) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.origin === new URL(supabaseUrl).origin &&
    url.pathname.startsWith(SIGNED_DOCUMENTS_PATH) &&
    !url.pathname.split('/').includes('..') &&
    (url.searchParams.get(SIGNED_URL_TOKEN) ?? '') !== ''
  );
}

// The numbers of .wa-test-numbers: one E.164 number a line, blank lines and # comments left out.
export function testNumbersOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}
