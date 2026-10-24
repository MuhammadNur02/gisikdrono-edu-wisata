import { describe, expect, it } from 'vitest';

import { isRepeatedPayload, ticketTokenOf } from '@/lib/scanner/payload';

import { fakeTicketToken } from '../../../tests/fixtures/ticket-token';

const TOKEN = fakeTicketToken();

describe('ticketTokenOf', () => {
  it('reads the token from a ticket landing URL of any deployment', () => {
    expect(ticketTokenOf(`https://eduwisata.example/v/${TOKEN}`)).toBe(TOKEN);
    expect(ticketTokenOf(`https://preview-123.vercel.app/v/${TOKEN}`)).toBe(TOKEN);
    expect(ticketTokenOf(`  http://127.0.0.1:3000/v/${TOKEN}\n`)).toBe(TOKEN);
  });

  it('accepts a bare token', () => {
    expect(ticketTokenOf(TOKEN)).toBe(TOKEN);
  });

  it.each([
    '',
    'hello',
    'https://example.com/',
    `https://example.com/x/${TOKEN}`,
    `https://example.com/v/${TOKEN}/extra`,
    `javascript:alert(1)//v/${TOKEN}`,
    `ftp://example.com/v/${TOKEN}`,
    fakeTicketToken({ kid: 'K1' }),
    fakeTicketToken({ signature: 'b'.repeat(21) }),
    'GSK-7F3K9Q2M',
    `https://example.com/v/${TOKEN}${'a'.repeat(600)}`,
  ])('refuses %j as no ticket', (raw) => {
    expect(ticketTokenOf(raw)).toBeNull();
  });
});

describe('isRepeatedPayload', () => {
  const last = { payload: TOKEN, at: 10_000 };

  it('ignores the same payload within the window', () => {
    expect(isRepeatedPayload(TOKEN, last, 12_999, 3000)).toBe(true);
  });

  it('takes the same payload again once the window has passed, and another payload at once', () => {
    expect(isRepeatedPayload(TOKEN, last, 13_000, 3000)).toBe(false);
    expect(isRepeatedPayload(`${TOKEN}x`, last, 10_001, 3000)).toBe(false);
    expect(isRepeatedPayload(TOKEN, null, 10_001, 3000)).toBe(false);
  });
});
