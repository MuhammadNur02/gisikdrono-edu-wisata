import { describe, expect, it } from 'vitest';

import { clientIpFrom, rateLimitIpBucket } from '@/lib/utils/client-ip';

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

describe('rateLimitIpBucket', () => {
  it('counts an IPv4 address as itself, also when it arrives IPv4-mapped', () => {
    expect(rateLimitIpBucket('203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitIpBucket('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('counts every address of one IPv6 /64 as one bucket, however it is written', () => {
    const bucket = rateLimitIpBucket('2001:db8:1:2::1');

    expect(bucket).toBe('2001:db8:1:2::/64');
    expect(rateLimitIpBucket('2001:0DB8:0001:0002:ffff:eeee:dddd:cccc')).toBe(bucket);
    expect(rateLimitIpBucket('2001:db8:1:2:0:0:0:9')).toBe(bucket);
    expect(rateLimitIpBucket('2001:db8:1:2::7%eth0')).toBe(bucket);
  });

  it('keeps different /64 networks apart', () => {
    expect(rateLimitIpBucket('2001:db8:1:3::1')).not.toBe(rateLimitIpBucket('2001:db8:1:2::1'));
    expect(rateLimitIpBucket('::1')).toBe('0:0:0:0::/64');
  });

  it('leaves anything that is not an address as it is', () => {
    expect(rateLimitIpBucket('unknown')).toBe('unknown');
    expect(rateLimitIpBucket('2001:db8::1::2')).toBe('2001:db8::1::2');
  });
});
