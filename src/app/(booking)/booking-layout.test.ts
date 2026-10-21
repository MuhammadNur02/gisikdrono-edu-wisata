import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import BookingLayout from './layout';

vi.mock('@/lib/request-nonce', () => ({ requestNonce: () => Promise.resolve(undefined) }));

// Review of PR #20: under a forced .dark the backdrop's top stayed brand-ice, a light tint that has no dark value,
// so the muted hint text on /reservasi/cari lost its contrast. The public pages start their gradient from
// secondary in dark (src/components/layout/page-header.tsx); the booking pages do the same.
describe('the booking layout', () => {
  it('starts its backdrop from a dark tint under .dark and from brand-ice otherwise', async () => {
    const html = renderToStaticMarkup(await BookingLayout({ children: null }));
    const backdrop = /<div class="([^"]*bg-linear-to-b[^"]*)"/.exec(html)?.[1] ?? '';
    expect(backdrop.split(' ')).toEqual(
      expect.arrayContaining(['from-brand-ice', 'to-background', 'dark:from-secondary']),
    );
  });
});
