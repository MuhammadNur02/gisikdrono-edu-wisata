import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import BookingLayout from './layout';

vi.mock('@/lib/request-nonce', () => ({ requestNonce: () => Promise.resolve(undefined) }));

const globalsCss = readFileSync(new URL('../../styles/globals.css', import.meta.url), 'utf8');
const [, darkBlock = ''] = globalsCss.split('.dark {');

// Review of PR #20: under a forced .dark the backdrop's top stayed a light tint, so the muted hint text on
// /reservasi/cari lost its contrast. Since the redesign brand-ice has a dark value of its own (the dark surface), so
// one gradient serves both themes.
describe('the booking layout', () => {
  it('starts its backdrop from brand-ice, which has a dark value', async () => {
    const html = renderToStaticMarkup(await BookingLayout({ children: null }));
    const backdrop = /<div class="([^"]*bg-linear-to-b[^"]*)"/.exec(html)?.[1] ?? '';
    expect(backdrop.split(' ')).toEqual(
      expect.arrayContaining(['from-brand-ice', 'to-background']),
    );
    expect(darkBlock).toMatch(/--brand-ice:\s*#1e1a15;/);
  });
});
