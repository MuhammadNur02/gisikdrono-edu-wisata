import 'server-only';

import { unstable_cache } from 'next/cache';

// CLAUDE.md §5.5: every public read is cached for everyone, under the registry tags of ./tags.ts and for an
// hour at most, so an edit shows once its action revalidates the tag and a missed tag heals by itself.
export const PUBLIC_REVALIDATE_SECONDS = 3600;

// unstable_cache keys an entry on keyParts plus the arguments the read is called with, so one wrapper
// serves every slug or filter. What the read returns is stored as JSON: DTOs hold ISO strings, never Dates.
export function cachedPublicRead<Args extends unknown[], Result>(
  read: (...args: Args) => Promise<Result>,
  keyParts: string[],
  tags: string[],
): (...args: Args) => Promise<Result> {
  return unstable_cache(read, keyParts, { tags, revalidate: PUBLIC_REVALIDATE_SECONDS });
}

// A failed read throws, so nothing is cached and an ISR page keeps serving its last good version. The
// PostgREST code is enough to find the cause in the logs; the visitor sees error.tsx and its digest only.
export class PublicReadError extends Error {
  constructor(what: string, code: string) {
    super(`public read of ${what} failed (${code})`);
    this.name = 'PublicReadError';
  }
}

interface ReadResult<Data> {
  data: Data | null;
  error: { code: string } | null;
}

export function rowsOf<Row>(result: ReadResult<Row[]>, what: string): Row[] {
  if (result.error) throw new PublicReadError(what, result.error.code);
  return result.data ?? [];
}

// For .maybeSingle(): no row is a normal answer (an unknown or unpublished slug), not an error.
export function rowOrNull<Row>(result: ReadResult<Row>, what: string): Row | null {
  if (result.error) throw new PublicReadError(what, result.error.code);
  return result.data;
}
