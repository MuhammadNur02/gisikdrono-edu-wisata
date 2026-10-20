import 'server-only';

import { headers } from 'next/headers';

import { NONCE_HEADER } from '@/lib/csp';

// The per-request CSP nonce src/middleware.ts hands the private routes (docs/Security.md §8.2), for the few inline
// scripts their layouts render themselves, such as next-themes' theme script. Undefined outside a private route.
export async function requestNonce(): Promise<string | undefined> {
  return (await headers()).get(NONCE_HEADER) ?? undefined;
}
