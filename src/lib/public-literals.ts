// The NEXT_PUBLIC_* values as the build inlines them, for code that reaches the browser (CLAUDE.md §7.7 and the
// first-load budgets of §8, Task P5.6.01). src/lib/public-env.ts validates the same values with zod at build time
// (next.config.ts loads it) and on the server (src/lib/env.ts), and stays out of client bundles, so zod and t3-env
// do not ship with every public page. Each value is read by its literal name, which is how Next.js inlines it. A
// value missing here would already have failed the build in public-env.ts, so the throw is a type narrowing, not
// a path a visitor reaches.
function inlined(name: string, value: string | undefined): string {
  if (value === undefined || value === '') throw new Error(`${name} is not set`);
  return value;
}

export const PUBLIC_SITE_URL = inlined('NEXT_PUBLIC_SITE_URL', process.env.NEXT_PUBLIC_SITE_URL);
export const PUBLIC_SUPABASE_URL = inlined(
  'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
export const PUBLIC_SUPABASE_ANON_KEY = inlined(
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
export const PUBLIC_TURNSTILE_SITE_KEY = inlined(
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
);
export const PUBLIC_WHATSAPP_CONTACT_NUMBER = inlined(
  'NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER',
  process.env.NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER,
);
