import { PHASE_PRODUCTION_SERVER } from 'next/constants';
import { describe, expect, it } from 'vitest';

import { isRwSlug, rwPagePath, rwRouteRewriteFor, rwSchedulePath } from '@/lib/utils/paths';

import { MOVED_PATHS } from './redirects';
import config from '../../next.config';

describe('MOVED_PATHS', () => {
  it('sends the arts programme of the old RW 08 page to RW 13, schedule and all', () => {
    expect(MOVED_PATHS).toEqual([
      {
        source: rwPagePath('rw-08-kampung-seni-budaya'),
        destination: rwPagePath('rw-13-kampung-budaya-seni'),
      },
      {
        source: rwSchedulePath('rw-08-kampung-seni-budaya'),
        destination: rwSchedulePath('rw-13-kampung-budaya-seni'),
      },
    ]);
  });

  // The middleware would serve an old RW address from the RW folder, where it is no RW any more; next.config's
  // redirects run before it, which the production-build probe of Task P2.10.03 checks end to end.
  it('names RW addresses the middleware would otherwise rewrite, and sends them to RW addresses', () => {
    for (const { source, destination } of MOVED_PATHS) {
      expect(rwRouteRewriteFor(source)).not.toBeNull();
      expect(rwRouteRewriteFor(destination)).not.toBeNull();
      expect(isRwSlug(destination.split('/')[1] ?? '')).toBe(true);
    }
  });

  it('is answered by next.config.ts with a permanent redirect', async () => {
    const redirects = (await config(PHASE_PRODUCTION_SERVER).redirects?.()) ?? [];
    expect(redirects).toEqual(MOVED_PATHS.map((moved) => ({ ...moved, permanent: true })));
  });
});
