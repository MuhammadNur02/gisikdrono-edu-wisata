import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import { z } from 'zod';

import type { MediaTarget } from './seed-photos';

// pnpm db:seed:staging-media (scripts/seed-staging-media.ts): the MediaTarget for the hosted staging project. Its
// three credentials come from a file outside the repository, which the owner fills from Bitwarden and deletes
// afterwards (docs/runbooks/staging-setup.md, D.7). Before anything is written, two guards must both pass, and
// any doubt stops the run: the Management API names the project gisikdrono-staging, and the database's own Vault
// secret `environment` says staging (D.1). No credential or secret value is ever printed; only counts and paths.

export const STAGING_PROJECT_NAME = 'gisikdrono-staging';
export const DEFAULT_CREDENTIALS_FILE = join(homedir(), 'gisikdrono-staging-media.env');
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANAGEMENT_API = 'https://api.supabase.com/v1';
// Postgres error texts are kept short in the thrown message; they never hold a credential.
const MAX_ERROR_TEXT = 300;

const credentialsSchema = z.object({
  STAGING_PROJECT_REF: z.string().regex(/^[a-z]{20}$/),
  SUPABASE_ACCESS_TOKEN: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type StagingCredentials = z.infer<typeof credentialsSchema>;

type Fetch = typeof fetch;
type Log = (line: string) => void;

function comparablePath(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

export function isInsideFolder(folder: string, path: string): boolean {
  const fromFolder = relative(comparablePath(resolve(folder)), comparablePath(resolve(path)));
  return fromFolder === '' || (!fromFolder.startsWith('..') && !isAbsolute(fromFolder));
}

// A credentials file in the repository could be committed, so one there is refused before it is even read.
export function readStagingCredentials(file: string, repoRoot = REPO_ROOT): StagingCredentials {
  const path = existsSync(file) ? realpathSync(file) : resolve(file);
  if (isInsideFolder(repoRoot, path) || isInsideFolder(repoRoot, file)) {
    throw new Error(`refusing ${file}: the credentials file must live outside the repository`);
  }
  if (!existsSync(path)) throw new Error(`no credentials file at ${file}`);
  const parsed = credentialsSchema.safeParse(parseEnv(credentialsText(path)));
  if (!parsed.success) {
    // Only the names of the bad keys, never what they hold.
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`missing or malformed in ${file}: ${names.join(', ')}`);
  }
  return parsed.data;
}

// Notepad may save a byte-order mark and Windows line ends; neither belongs to a key or a value.
function credentialsText(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/^\uFEFF/, '')
    .replaceAll('\r\n', '\n');
}

async function errorText(response: Response): Promise<string> {
  const text = await response.text();
  return text.slice(0, MAX_ERROR_TEXT);
}

export async function assertStagingProject(
  credentials: StagingCredentials,
  fetchFn: Fetch = fetch,
): Promise<void> {
  const response = await fetchFn(`${MANAGEMENT_API}/projects/${credentials.STAGING_PROJECT_REF}`, {
    headers: { Authorization: `Bearer ${credentials.SUPABASE_ACCESS_TOKEN}` },
  });
  if (!response.ok) {
    throw new Error(`the Management API refused the project lookup (${String(response.status)})`);
  }
  const project = z.object({ name: z.string() }).safeParse(await response.json());
  if (!project.success || project.data.name !== STAGING_PROJECT_NAME) {
    throw new Error(`the project is not named ${STAGING_PROJECT_NAME}; nothing was written`);
  }
}

// The comparison happens inside the database, so the secret's value never reaches this process.
const ENVIRONMENT_CHECK = `select coalesce(bool_or(decrypted_secret = 'staging'), false) as is_staging
  from vault.decrypted_secrets where name = 'environment'`;

export async function assertStagingEnvironment(target: MediaTarget): Promise<void> {
  const rows = z
    .array(z.object({ is_staging: z.boolean() }))
    .safeParse(await target.runSql(ENVIRONMENT_CHECK));
  if (!rows.success || rows.data[0]?.is_staging !== true) {
    throw new Error(`the database's Vault secret environment is not staging; nothing was written`);
  }
}

function managementSql(credentials: StagingCredentials, fetchFn: Fetch): MediaTarget['runSql'] {
  return async (query) => {
    const url = `${MANAGEMENT_API}/projects/${credentials.STAGING_PROJECT_REF}/database/query`;
    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) {
      throw new Error(`SQL failed (${String(response.status)}): ${await errorText(response)}`);
    }
    return z.array(z.unknown()).parse(await response.json());
  };
}

function storageUpload(
  credentials: StagingCredentials,
  fetchFn: Fetch,
  log: Log,
): MediaTarget['upload'] {
  const storage = `https://${credentials.STAGING_PROJECT_REF}.supabase.co/storage/v1/object`;
  return async (bucket, path, body, contentType) => {
    const response = await fetchFn(`${storage}/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        apikey: credentials.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${credentials.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(body),
    });
    if (!response.ok) {
      throw new Error(
        `upload of ${bucket}/${path} failed (${String(response.status)}): ${await errorText(response)}`,
      );
    }
    log(`uploaded ${bucket}/${path}`);
  };
}

// Reads the credentials, runs both guards and only then hands out the target that writes.
export async function openStagingTarget(
  file: string,
  { fetchFn = fetch, log = () => undefined }: { fetchFn?: Fetch; log?: Log } = {},
): Promise<MediaTarget> {
  const credentials = readStagingCredentials(file);
  await assertStagingProject(credentials, fetchFn);
  const target: MediaTarget = {
    upload: storageUpload(credentials, fetchFn, log),
    runSql: managementSql(credentials, fetchFn),
  };
  await assertStagingEnvironment(target);
  return target;
}
