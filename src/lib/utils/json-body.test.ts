import { describe, expect, it } from 'vitest';

import { readJsonBody, readJsonText } from './json-body';

const URL_OF_ROUTE = 'http://127.0.0.1:3000/api/uploads/sign';

function post(body: string, headers: Record<string, string> = {}) {
  return new Request(URL_OF_ROUTE, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('readJsonText', () => {
  it('keeps the body exactly as it came, for a caller that hashes it', async () => {
    const raw = '{"gross_amount":"600000.00" }';
    await expect(readJsonText(post(raw), 64)).resolves.toEqual({ ok: true, text: raw });
  });

  it('refuses another type and a body over the limit', async () => {
    await expect(readJsonText(post('{}', { 'content-type': 'text/plain' }), 64)).resolves.toEqual({
      ok: false,
      status: 415,
    });
    await expect(readJsonText(post('x'.repeat(65)), 64)).resolves.toEqual({
      ok: false,
      status: 413,
    });
  });
});

describe('readJsonBody', () => {
  it('parses a small JSON body', async () => {
    await expect(readJsonBody(post('{"rwId":5}'), 64)).resolves.toEqual({
      ok: true,
      value: { rwId: 5 },
    });
  });

  it('accepts a charset after the type', async () => {
    const request = post('{}', { 'content-type': 'application/json; charset=utf-8' });
    await expect(readJsonBody(request, 64)).resolves.toMatchObject({ ok: true });
  });

  it('answers 415 to anything but JSON', async () => {
    const request = post('rwId=5', { 'content-type': 'application/x-www-form-urlencoded' });
    await expect(readJsonBody(request, 64)).resolves.toEqual({ ok: false, status: 415 });
  });

  it('answers 413 to a body over the cap, declared or real', async () => {
    const big = JSON.stringify({ padding: 'x'.repeat(100) });
    await expect(readJsonBody(post(big), 64)).resolves.toEqual({ ok: false, status: 413 });
    await expect(readJsonBody(post('{}', { 'content-length': '100000' }), 64)).resolves.toEqual({
      ok: false,
      status: 413,
    });
  });

  // Security review of PR #14, L5: a chunked body carries no length to check up front.
  it('stops reading a body sent without a length as soon as it passes the cap', async () => {
    let chunksPulled = 0;
    let isCancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksPulled += 1;
        controller.enqueue(new TextEncoder().encode('{"padding":"xxxx'));
      },
      cancel() {
        isCancelled = true;
      },
    });
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      body: endless,
      headers: { 'content-type': 'application/json' },
      duplex: 'half',
    };
    const request = new Request(URL_OF_ROUTE, init);
    expect(request.headers.get('content-length')).toBeNull();

    await expect(readJsonBody(request, 64)).resolves.toEqual({ ok: false, status: 413 });
    expect(chunksPulled).toBeLessThan(10);
    expect(isCancelled).toBe(true);
  });

  it('answers 400 to broken JSON', async () => {
    await expect(readJsonBody(post('{"rwId":'), 64)).resolves.toEqual({ ok: false, status: 400 });
  });
});
