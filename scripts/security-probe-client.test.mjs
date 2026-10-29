import { describe, expect, it } from 'vitest';

import { guarded, requestOrExplain } from './security-probe-client.ts';

// Task P5.2.02 (review of PR #111): a failed request never puts the host it could not reach into the probe's output,
// which is pasted into the public repository.

const HOST = 'preview-host.example.test';

// What undici's fetch throws for a DNS failure: a TypeError whose cause names the host.
function dnsFailure() {
  const error = new TypeError('fetch failed');
  error.cause = new Error(`getaddrinfo ENOTFOUND ${HOST}`);
  return error;
}

function probeThatFails(error) {
  return { origin: `https://${HOST}`, isProduction: false, request: () => Promise.reject(error) };
}

describe('requestOrExplain', () => {
  it('names the path and the kind of error, never the host', async () => {
    const attempt = requestOrExplain(probeThatFails(dnsFailure()), '/');
    await expect(attempt).rejects.toThrow('the request for / failed (TypeError)');
    const thrown = await attempt.catch((error) => error);
    expect(String(thrown.message)).not.toContain(HOST);
    expect(thrown.cause).toBeUndefined();
  });

  it('hands back the response of a request that worked', async () => {
    const response = new Response(null, { status: 204 });
    const probe = {
      origin: `https://${HOST}`,
      isProduction: false,
      request: () => Promise.resolve(response),
    };
    await expect(requestOrExplain(probe, '/')).resolves.toBe(response);
  });
});

describe('guarded', () => {
  it('turns a failed request into a failed check that names no host', async () => {
    const check = guarded('a check', () => probeThatFails(dnsFailure()).request('/'));
    const result = await check();
    expect(result).toEqual({ name: 'a check', problems: ['the request failed (TypeError)'] });
  });
});
