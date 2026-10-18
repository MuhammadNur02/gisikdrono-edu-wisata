import { describe, expect, it } from 'vitest';

import { readJsonBody } from './json-body';

const URL_OF_ROUTE = 'http://127.0.0.1:3000/api/uploads/sign';

function post(body: string, headers: Record<string, string> = {}) {
  return new Request(URL_OF_ROUTE, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

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

  it('answers 400 to broken JSON', async () => {
    await expect(readJsonBody(post('{"rwId":'), 64)).resolves.toEqual({ ok: false, status: 400 });
  });
});
