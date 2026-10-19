import { describe, expect, it } from 'vitest';

import { clientIpFrom } from '@/lib/utils/client-ip';

describe('clientIpFrom', () => {
  it('prefers x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' });
    expect(clientIpFrom(headers)).toBe('203.0.113.7');
  });

  it('takes the first x-forwarded-for entry, the client itself', () => {
    const headers = new Headers({ 'x-forwarded-for': ' 198.51.100.1 , 10.0.0.1' });
    expect(clientIpFrom(headers)).toBe('198.51.100.1');
  });

  it('puts a request without either header in one shared bucket', () => {
    expect(clientIpFrom(new Headers())).toBe('unknown');
    expect(clientIpFrom(new Headers({ 'x-forwarded-for': ' ' }))).toBe('unknown');
  });
});
