import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isInsideFolder, openStagingTarget, readStagingCredentials } from './staging-target.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REF = 'abcdefghijklmnopqrst';
const ACCESS_TOKEN = 'sbp_test_access_token_value';
const SERVICE_ROLE_KEY = 'test-service-role-key-value';
const VALID_FILE = [
  '# staging media credentials',
  `STAGING_PROJECT_REF=${REF}`,
  `SUPABASE_ACCESS_TOKEN=${ACCESS_TOKEN}`,
  `SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}`,
].join('\n');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// A Management API that answers the project lookup and the Vault check as told, and records every call.
function stubApi({ name = 'gisikdrono-staging', isStaging = true, projectStatus = 200 } = {}) {
  return vi.fn(async (url, init) => {
    if (String(url).endsWith(`/projects/${REF}`)) return jsonResponse({ name }, projectStatus);
    if (String(url).endsWith('/database/query')) {
      expect(JSON.parse(init.body).query).toContain("name = 'environment'");
      return jsonResponse(isStaging === null ? [] : [{ is_staging: isStaging }], 201);
    }
    return new Response('', { status: 200 });
  });
}

describe('scripts/staging-target.ts', () => {
  let folder;
  let file;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'staging-media-'));
    file = join(folder, 'gisikdrono-staging-media.env');
  });
  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('opens the target when the project is gisikdrono-staging and the Vault says staging', async () => {
    writeFileSync(file, VALID_FILE);
    const fetchFn = stubApi();
    const target = await openStagingTarget(file, { fetchFn });
    await target.upload('public-media', 'rw-05/gallery/x.webp', Buffer.from('webp'), 'image/webp');
    const [uploadUrl, uploadInit] = fetchFn.mock.calls.at(-1);
    expect(uploadUrl).toBe(
      `https://${REF}.supabase.co/storage/v1/object/public-media/rw-05/gallery/x.webp`,
    );
    expect(uploadInit.headers['x-upsert']).toBe('true');
  });

  it('refuses a project with another name before any SQL runs', async () => {
    writeFileSync(file, VALID_FILE);
    const fetchFn = stubApi({ name: 'gisikdrono-prod' });
    await expect(openStagingTarget(file, { fetchFn })).rejects.toThrow(
      /not named gisikdrono-staging/,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refuses when the project lookup fails', async () => {
    writeFileSync(file, VALID_FILE);
    await expect(
      openStagingTarget(file, { fetchFn: stubApi({ projectStatus: 401 }) }),
    ).rejects.toThrow(/refused the project lookup/);
  });

  it.each([false, null])(
    'refuses a database whose Vault environment is not staging (%s)',
    async (isStaging) => {
      writeFileSync(file, VALID_FILE);
      await expect(openStagingTarget(file, { fetchFn: stubApi({ isStaging }) })).rejects.toThrow(
        /environment is not staging/,
      );
    },
  );

  it('refuses a credentials file inside the repository without reading it', () => {
    expect(() => readStagingCredentials(join(REPO_ROOT, 'staging-media.env'))).toThrow(
      /outside the repository/,
    );
    expect(() => readStagingCredentials(join(REPO_ROOT, 'scripts', 'x.env'))).toThrow(
      /outside the repository/,
    );
  });

  it('names missing keys without printing any value', () => {
    writeFileSync(file, `STAGING_PROJECT_REF=${REF}\nSUPABASE_ACCESS_TOKEN=${ACCESS_TOKEN}\n`);
    const read = () => readStagingCredentials(file);
    expect(read).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(read).not.toThrow(new RegExp(ACCESS_TOKEN));
    expect(read).not.toThrow(new RegExp(REF));
  });

  it('reads a file Notepad saved with a byte-order mark and Windows line ends', () => {
    writeFileSync(file, `﻿${VALID_FILE.replaceAll('\n', '\r\n')}\r\n`);
    expect(readStagingCredentials(file)).toEqual({
      STAGING_PROJECT_REF: REF,
      SUPABASE_ACCESS_TOKEN: ACCESS_TOKEN,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    });
  });

  it('refuses a missing credentials file', () => {
    expect(() => readStagingCredentials(file)).toThrow(/no credentials file/);
  });

  it('tells inside from outside a folder', () => {
    expect(isInsideFolder(REPO_ROOT, join(REPO_ROOT, 'a', 'b'))).toBe(true);
    expect(isInsideFolder(REPO_ROOT, REPO_ROOT)).toBe(true);
    expect(isInsideFolder(REPO_ROOT, folder)).toBe(false);
    expect(isInsideFolder(join(REPO_ROOT, 'repo'), join(REPO_ROOT, 'repo-other', 'x.env'))).toBe(
      false,
    );
  });
});
