import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import BookingLayout from './layout';

vi.mock('@/lib/request-nonce', () => ({ requestNonce: () => Promise.resolve(undefined) }));

const globalsCss = readFileSync(new URL('../../styles/globals.css', import.meta.url), 'utf8');
const [, darkBlock = ''] = globalsCss.split('.dark {');

// Review of PR #20: under a forced .dark the backdrop stayed a light tint, so the muted hint text on /reservasi/cari
// lost its contrast. Since the redesign (DESIGN-SPEC §3.10–§3.13) the booking pages sit on the plain paper, whose
// token has a dark value of its own.
describe('the booking layout', () => {
  it('paints the paper background, which has a dark value', async () => {
    const html = renderToStaticMarkup(await BookingLayout({ children: null }));
    const backdrop = /<div class="([^"]*min-h-dvh[^"]*)"/.exec(html)?.[1] ?? '';
    expect(backdrop.split(' ')).toContain('bg-background');
    expect(darkBlock).toMatch(/--background:\s*#14110d;/);
  });
});
