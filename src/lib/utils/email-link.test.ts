import { describe, expect, it } from 'vitest';

import { emailLinkQuery, parseEmailLink } from '@/lib/utils/email-link';

describe('parseEmailLink', () => {
  it('reads a recovery or an invite link', () => {
    expect(parseEmailLink('abc', 'recovery')).toEqual({ type: 'recovery', tokenHash: 'abc' });
    expect(parseEmailLink('abc', 'invite')).toEqual({ type: 'invite', tokenHash: 'abc' });
  });

  it.each([
    ['another kind', 'abc', 'magiclink'],
    ['no token', null, 'recovery'],
    ['an empty token', '', 'invite'],
    ['an overlong token', 'a'.repeat(513), 'recovery'],
  ])('refuses %s', (_case, tokenHash, type) => {
    expect(parseEmailLink(tokenHash, type)).toBeNull();
  });

  it('writes the query the continue page carries', () => {
    expect(emailLinkQuery({ type: 'invite', tokenHash: 'a&b' })).toBe(
      'token_hash=a%26b&type=invite',
    );
  });
});
