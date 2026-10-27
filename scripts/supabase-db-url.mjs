// node scripts/supabase-db-url.mjs "$GITHUB_ENV" <<< "$SUPABASE_DB_URL" (Tasks P5.7.02 and P5.5.04;
// .github/workflows/release.yml and backup.yml). Reads the CI secret SUPABASE_DB_URL on stdin, never from argv where
// the process list would show it, and hands the steps after it what the Supabase CLI and
// pg_dump need: the project ref (PROJECT_REF), so the job can ask the Management API which project the URL belongs
// to before anything runs, and the database password (SUPABASE_DB_PASSWORD, the CLI's own variable), masked in the
// log first. Nothing is printed except GitHub's mask command; a URL it cannot read stops the job with a reason that
// holds no part of the URL. Needs Node alone, no pnpm install.
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PROJECT_REF = /^[a-z]{20}$/;
// The direct host db.<ref>.supabase.co, or the pooler's user postgres.<ref>.
const DIRECT_HOST = /^db\.([a-z]{20})\.supabase\.co$/;
const POOLER_USER = /^postgres\.([a-z]{20})$/;
// pg_dump must check the server's certificate against the pinned CA, never merely encrypt (staging-db.yml's note).
const VERIFIED_SSL_MODE = 'verify-full';

function projectRefOf(url) {
  const fromHost = DIRECT_HOST.exec(url.hostname)?.[1];
  const fromUser = POOLER_USER.exec(decodeURIComponent(url.username))?.[1];
  const ref = fromHost ?? fromUser;
  if (ref === undefined || !PROJECT_REF.test(ref)) {
    throw new Error(
      'SUPABASE_DB_URL names no Supabase project (db.<ref>.supabase.co or user postgres.<ref>)',
    );
  }
  if (fromHost !== undefined && fromUser !== undefined && fromHost !== fromUser) {
    throw new Error('SUPABASE_DB_URL names two different projects in its host and its user');
  }
  return ref;
}

// The project ref and the decoded password; an sslmode in the URL itself may only be verify-full.
export function parseSupabaseDbUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('SUPABASE_DB_URL is not a URL');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('SUPABASE_DB_URL is not a postgresql:// URL');
  }
  const password = decodeURIComponent(url.password);
  if (password.length === 0) throw new Error('SUPABASE_DB_URL holds no password');
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode !== null && sslMode !== VERIFIED_SSL_MODE) {
    throw new Error(
      `SUPABASE_DB_URL asks for sslmode=${sslMode}; leave it out or use ${VERIFIED_SSL_MODE}`,
    );
  }
  return { ref: projectRefOf(url), password };
}

// GitHub's workflow commands: the mask goes to the log before the value reaches any later step.
export function githubEnvLines({ ref, password }) {
  return {
    log: `::add-mask::${password}\n`,
    env: `PROJECT_REF=${ref}\nSUPABASE_DB_PASSWORD=${password}\n`,
  };
}

const STDIN = 0;

function main() {
  const value = readFileSync(STDIN, 'utf8').trim();
  const [envFile] = process.argv.slice(2);
  if (!value) throw new Error('SUPABASE_DB_URL is not set in this GitHub environment');
  if (!envFile) throw new Error('name the GITHUB_ENV file; run this inside a GitHub Actions job');
  const lines = githubEnvLines(parseSupabaseDbUrl(value));
  if (lines.env.split('\n').length !== 3)
    throw new Error('the database password holds a line break');
  process.stdout.write(lines.log);
  appendFileSync(envFile, lines.env);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stdout.write(
      `::error::${error instanceof Error ? error.message : 'unreadable SUPABASE_DB_URL'}\n`,
    );
    process.exitCode = 1;
  }
}
