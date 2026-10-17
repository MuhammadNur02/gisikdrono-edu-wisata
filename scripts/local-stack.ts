import { execSync } from 'node:child_process';

import { z } from 'zod';

// The stack `supabase start` is running: its URL and keys come from the CLI, so the integration tests and
// pnpm db:seed carry no copied keys and work the same locally and in CI. The CLI reports only the stack on this
// machine, and localStack refuses any other address besides, so nothing built on it reaches a hosted project.
const statusSchema = z.object({
  API_URL: z.url(),
  ANON_KEY: z.string().min(1),
  SERVICE_ROLE_KEY: z.string().min(1),
});

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);

export type LocalStack = { apiUrl: string; anonKey: string; serviceRoleKey: string };

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
  };
  return cachedStack;
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
