import { describe, expect, it } from 'vitest';

import { isSameOriginRequest } from './same-origin';

function post(headers: Record<string, string> = {}) {
  return new Request('http://127.0.0.1:3000/api/uploads/finalize', {
    method: 'POST',
    body: '{}',
    headers,
  });
}

describe('isSameOriginRequest', () => {
  it('accepts a request from the site itself', () => {
    expect(isSameOriginRequest(post({ origin: 'http://127.0.0.1:3000' }))).toBe(true);
  });

  it('refuses another origin and a request that names none', () => {
    expect(isSameOriginRequest(post({ origin: 'https://evil.example' }))).toBe(false);
    expect(isSameOriginRequest(post({ origin: 'http://127.0.0.1:3001' }))).toBe(false);
    expect(isSameOriginRequest(post())).toBe(false);
  });
});
