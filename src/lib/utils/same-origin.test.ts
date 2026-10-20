import { describe, expect, it } from 'vitest';

import { isSameOriginRequest } from './same-origin';

function post(
  headers: Record<string, string> = {},
  url = 'http://127.0.0.1:3000/api/uploads/finalize',
) {
  return new Request(url, { method: 'POST', body: '{}', headers });
}

describe('isSameOriginRequest', () => {
  it('accepts a request from the site itself', () => {
    expect(isSameOriginRequest(post({ origin: 'http://127.0.0.1:3000' }))).toBe(true);
  });

  it('refuses another origin and a request that names none', () => {
    expect(isSameOriginRequest(post({ origin: 'https://evil.example' }))).toBe(false);
    expect(isSameOriginRequest(post({ origin: 'http://127.0.0.1:3001' }))).toBe(false);
    expect(isSameOriginRequest(post({ origin: 'null' }))).toBe(false);
    expect(isSameOriginRequest(post())).toBe(false);
  });

  it('compares with the host the browser asked for, not the address the server listens on', () => {
    const local = 'http://localhost:3000/auth/signout';

    expect(
      isSameOriginRequest(post({ origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' }, local)),
    ).toBe(true);
    expect(
      isSameOriginRequest(post({ origin: 'https://evil.example', host: '127.0.0.1:3000' }, local)),
    ).toBe(false);
  });

  it('reads the first host a proxy forwarded, as Next.js does for Server Actions', () => {
    const headers = {
      origin: 'https://wisata.gisikdrono.go.id',
      host: 'internal:3000',
      'x-forwarded-host': 'wisata.gisikdrono.go.id, cdn.example',
    };

    expect(isSameOriginRequest(post(headers))).toBe(true);
  });
});
