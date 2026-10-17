import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isUsableTypesOutput, replaceTypesFile } from './gen-db-types.mjs';

const PREVIOUS_TYPES = 'export type Database = { previous: true };\n';
const FRESH_TYPES = 'export type Json = string;\nexport type Database = { fresh: true };\n';

let directory;
let target;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'gen-db-types-'));
  target = join(directory, 'types.ts');
  await writeFile(target, PREVIOUS_TYPES, 'utf8');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('isUsableTypesOutput', () => {
  it('accepts generated types and refuses empty or unrelated output', () => {
    expect(isUsableTypesOutput(FRESH_TYPES)).toBe(true);
    expect(isUsableTypesOutput('')).toBe(false);
    expect(isUsableTypesOutput('failed to connect to postgres: timeout')).toBe(false);
  });
});

describe('replaceTypesFile', () => {
  it('replaces the file when the generator succeeds', async () => {
    const result = await replaceTypesFile({
      target,
      generate: () => Promise.resolve({ exitCode: 0, output: FRESH_TYPES }),
    });
    expect(result).toEqual({ replaced: true });
    expect(await readFile(target, 'utf8')).toBe(FRESH_TYPES);
    expect(await readdir(directory)).toEqual(['types.ts']);
  });

  it('keeps the previous file when the generator fails, as on a Postgres timeout', async () => {
    const result = await replaceTypesFile({
      target,
      generate: () => Promise.resolve({ exitCode: 1, output: '' }),
    });
    expect(result).toEqual({ replaced: false, reason: 'exit code 1' });
    expect(await readFile(target, 'utf8')).toBe(PREVIOUS_TYPES);
    expect(await readdir(directory)).toEqual(['types.ts']);
  });

  it('keeps the previous file when the generator exits cleanly without a Database type', async () => {
    const result = await replaceTypesFile({
      target,
      generate: () => Promise.resolve({ exitCode: 0, output: '' }),
    });
    expect(result.replaced).toBe(false);
    expect(await readFile(target, 'utf8')).toBe(PREVIOUS_TYPES);
  });

  it('keeps the previous file when the CLI cannot be started', async () => {
    const result = await replaceTypesFile({
      target,
      generate: () =>
        Promise.resolve({ exitCode: 1, output: '', error: new Error('spawn supabase ENOENT') }),
    });
    expect(result).toEqual({ replaced: false, reason: 'spawn supabase ENOENT' });
    expect(await readFile(target, 'utf8')).toBe(PREVIOUS_TYPES);
  });
});
