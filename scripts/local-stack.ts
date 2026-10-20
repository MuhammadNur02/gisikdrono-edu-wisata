import { execSync } from 'node:child_process';

import { z } from 'zod';

// The stack `supabase start` is running: its URL and keys come from the CLI, so the integration tests and
// pnpm db:seed carry no copied keys and work the same locally and in CI. The CLI reports only the stack on this
// machine, and localStack refuses any other address besides, so nothing built on it reaches a hosted project.
const statusSchema = z.object({
  API_URL: z.url(),
  ANON_KEY: z.string().min(1),
  SERVICE_ROLE_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  // Mailpit, which catches every email of the stack; older CLIs name it only INBUCKET_URL.
  MAILPIT_URL: z.url().optional(),
  INBUCKET_URL: z.url().optional(),
});

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);

export type LocalStack = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  jwtSecret: string;
  mailUrl: string | undefined;
};

let cachedStack: LocalStack | undefined;

export function isLocalSupabaseUrl(url: string): boolean {
  return LOCAL_HOSTNAMES.has(new URL(url).hostname);
}

export function localStack(): LocalStack {
  if (cachedStack) return cachedStack;
  // A fixed command through the shell, because on Windows the CLI may be a .cmd shim.
  const output = execSync('supabase status -o json', { encoding: 'utf8' });
  const status = statusSchema.parse(JSON.parse(output));
  if (!isLocalSupabaseUrl(status.API_URL)) {
    throw new Error(`the Supabase stack at ${status.API_URL} is not the local one on 127.0.0.1`);
  }
  cachedStack = {
    apiUrl: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
    jwtSecret: status.JWT_SECRET,
    mailUrl: status.MAILPIT_URL ?? status.INBUCKET_URL,
  };
  return cachedStack;
}

// A SQL string literal for values the scripts build themselves.
export function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

// Writes a file into a bucket of the local stack with the service role, replacing what is at that path, the
// way api/uploads/finalize writes public-media.
export async function uploadToLocalBucket(
  bucket: string,
  path: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { apiUrl, serviceRoleKey } = localStack();
  const response = await fetch(`${apiUrl}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: new Uint8Array(body),
  });
  if (!response.ok) {
    throw new Error(
      `upload of ${bucket}/${path} failed (${String(response.status)}): ${await response.text()}`,
    );
  }
}

// Runs SQL as postgres through the stack's pg-meta route, the way Supabase Studio does. A row written here counts
// as a system writer, so the staff guards and the audit log accept it. Values are built by the callers themselves
// (uuids and fixed strings), never taken from outside.
export async function runSql(query: string): Promise<unknown[]> {
  const { apiUrl, serviceRoleKey } = localStack();
  const response = await fetch(`${apiUrl}/pg/query`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(`SQL failed (${String(response.status)}): ${JSON.stringify(body)}`);
  return z.array(z.unknown()).parse(body);
}
