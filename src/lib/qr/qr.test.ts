import { describe, expect, it } from 'vitest';

import { signTicket, ticketSignature, type SignedTicketFacts } from '@/lib/qr/sign';
import { isAuthenticTicket, readTicketToken } from '@/lib/qr/verify';

const KEY_RING = {
  k1: Buffer.alloc(32, 1).toString('base64'),
  k2: Buffer.alloc(32, 2).toString('base64'),
};
const TICKET: SignedTicketFacts = {
  ticketId: '0192f3a4-5b6c-7d8e-9f01-0000000000aa',
  rwId: 5,
  validOn: '2026-11-12',
};

describe('signTicket', () => {
  it('writes GSK.kid.id.signature, with no name, phone or booking code in it', () => {
    const token = signTicket(TICKET, 'k1', KEY_RING);
    expect(token).toMatch(/^GSK\.k1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/);
    expect(token).not.toContain('GSK-');
    expect(token.split('.')[3]).toBe(ticketSignature(TICKET, 'k1', KEY_RING));
  });

  it('signs the RW and the visit day too, so another leg or day gets another signature', () => {
    const signature = ticketSignature(TICKET, 'k1', KEY_RING);
    expect(ticketSignature({ ...TICKET, rwId: 13 }, 'k1', KEY_RING)).not.toBe(signature);
    expect(ticketSignature({ ...TICKET, validOn: '2026-11-13' }, 'k1', KEY_RING)).not.toBe(
      signature,
    );
    expect(ticketSignature(TICKET, 'k2', KEY_RING)).not.toBe(signature);
  });

  it('refuses a kid outside the grammar or the ring, and an id that is no uuid', () => {
    expect(() => signTicket(TICKET, 'K1', KEY_RING)).toThrow(RangeError);
    expect(() => signTicket(TICKET, 'k9', KEY_RING)).toThrow(/no kid k9/);
    expect(() => signTicket({ ...TICKET, ticketId: 'not-a-uuid' }, 'k1', KEY_RING)).toThrow(
      RangeError,
    );
  });
});

describe('readTicketToken', () => {
  it('reads the kid and the ticket id back', () => {
    const read = readTicketToken(signTicket(TICKET, 'k1', KEY_RING));
    expect(read).toEqual({
      kid: 'k1',
      ticketId: TICKET.ticketId,
      signature: ticketSignature(TICKET, 'k1', KEY_RING),
    });
  });

  it('reads nothing from another grammar, a truncated signature or an id of another length', () => {
    const token = signTicket(TICKET, 'k1', KEY_RING);
    expect(readTicketToken(token.slice(0, -1))).toBeNull();
    expect(readTicketToken(token.replace('GSK.', 'XYZ.'))).toBeNull();
    expect(readTicketToken(`GSK.k1.${'A'.repeat(21)}B.${'a'.repeat(22)}`)).toBeNull();
    expect(readTicketToken('https://example.test/v/anything')).toBeNull();
  });
});

describe('isAuthenticTicket', () => {
  const read = readTicketToken(signTicket(TICKET, 'k1', KEY_RING));
  if (read === null) throw new Error('the fixture token does not read');

  it('accepts a token signed for this ticket, its RW and its day', () => {
    expect(isAuthenticTicket(read, TICKET, KEY_RING)).toBe(true);
  });

  it('refuses a token checked against another ticket, RW or day', () => {
    expect(isAuthenticTicket(read, { ...TICKET, rwId: 13 }, KEY_RING)).toBe(false);
    expect(isAuthenticTicket(read, { ...TICKET, validOn: '2026-11-13' }, KEY_RING)).toBe(false);
    expect(
      isAuthenticTicket(
        read,
        { ...TICKET, ticketId: '0192f3a4-5b6c-7d8e-9f01-0000000000ab' },
        KEY_RING,
      ),
    ).toBe(false);
  });

  it('refuses a retired kid, a forged signature and a signature of another length', () => {
    expect(isAuthenticTicket(read, TICKET, { k2: KEY_RING.k2 })).toBe(false);
    expect(isAuthenticTicket({ ...read, signature: 'a'.repeat(22) }, TICKET, KEY_RING)).toBe(false);
    expect(isAuthenticTicket({ ...read, signature: 'short' }, TICKET, KEY_RING)).toBe(false);
  });
});

// docs/Security.md §9.1 (QR-05): a rotation adds a kid and signs new tickets with it; the old kid stays in the ring
// until 30 days after its last valid_on, then leaves it, and its tickets stop being valid.
describe('a key rotation', () => {
  const oldRead = readTicketToken(signTicket(TICKET, 'k1', KEY_RING));
  const newRead = readTicketToken(signTicket(TICKET, 'k2', KEY_RING));
  if (oldRead === null || newRead === null) throw new Error('the fixture tokens do not read');

  it('keeps tickets of the old kid valid while it is in the ring, beside those of the new one', () => {
    expect(isAuthenticTicket(oldRead, TICKET, KEY_RING)).toBe(true);
    expect(isAuthenticTicket(newRead, TICKET, KEY_RING)).toBe(true);
  });

  it('ends them once the old kid leaves the ring, and the new kid’s tickets carry on', () => {
    const afterRetirement = { k2: KEY_RING.k2 };
    expect(isAuthenticTicket(oldRead, TICKET, afterRetirement)).toBe(false);
    expect(isAuthenticTicket(newRead, TICKET, afterRetirement)).toBe(true);
  });

  it('never accepts an old signature relabelled with the new kid', () => {
    expect(isAuthenticTicket({ ...oldRead, kid: 'k2' }, TICKET, KEY_RING)).toBe(false);
  });
});
