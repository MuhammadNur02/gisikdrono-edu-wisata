// node scripts/supabase-db-url.mjs "$GITHUB_ENV" <<< "$SUPABASE_DB_URL" (Tasks P5.7.02 and P5.5.04;
// .github/workflows/release.yml and backup.yml). Reads the CI secret SUPABASE_DB_URL on stdin, never from argv where
// the process list would show it, and hands the steps after it the project ref (PROJECT_REF), which each job checks
// before anything runs, and the database password (SUPABASE_DB_PASSWORD, the Supabase CLI's own variable), masked in
// the log first. Nothing is printed except GitHub's mask command; a URL it cannot read stops the job with a reason
// that holds no part of the URL. Needs Node alone, no pnpm install.
//
// GitHub's runners reach the internet over IPv4 only, and Supabase's direct host db.<ref>.supabase.co answers over
// IPv6 only, so the secret holds the session pooler's address: port 5432, user <role>.<ref> (release-checklist.md,
// "One-time setup"). The direct form is still read, for a machine that has IPv6.
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PROJECT_REF = /^[a-z]{20}$/;
const DIRECT_HOST = /^db\.([a-z]{20})\.supabase\.co$/;
// postgres.<ref> for the release, the backup role's own name for the backup (restore-drills.md, part A).
const POOLER_USER = /^[a-z_][a-z0-9_]*\.([a-z]{20})$/;
// pg_dump must check the server's certificate against the pinned CA, never merely encrypt (staging-db.yml's note).
const VERIFIED_SSL_MODE = 'verify-full';
// A value in a workflow command is escaped as GitHub's runner unescapes it, so a % in a password masks itself.
const COMMAND_ESCAPES = [
  ['%', '%25'],
  ['\r', '%0D'],
  ['\n', '%0A'],
];

function projectRefOf(url) {
  const fromHost = DIRECT_HOST.exec(url.hostname)?.[1];
  const fromUser = POOLER_USER.exec(decodeURIComponent(url.username))?.[1];
  const ref = fromHost ?? fromUser;
  if (ref === undefined || !PROJECT_REF.test(ref)) {
    throw new Error(
      'SUPABASE_DB_URL names no Supabase project (pooler user <role>.<ref>, or db.<ref>.supabase.co)',
    );
  }
  if (fromHost !== undefined && fromUser !== undefined && fromHost !== fromUser) {
    throw new Error('SUPABASE_DB_URL names two different projects in its host and its user');
  }
  return ref;
}

function passwordOf(url) {
  const password = decodeURIComponent(url.password);
  if (password.length === 0) throw new Error('SUPABASE_DB_URL holds no password');
  // GITHUB_ENV is one NAME=value per line, so a line break would start a variable of its own.
  if (/[\r\n]/.test(password)) throw new Error('the database password holds a line break');
  return password;
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
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode !== null && sslMode !== VERIFIED_SSL_MODE) {
    throw new Error(
      `SUPABASE_DB_URL asks for sslmode=${sslMode}; leave it out or use ${VERIFIED_SSL_MODE}`,
    );
  }
  return { ref: projectRefOf(url), password: passwordOf(url) };
}

export function escapeCommandValue(value) {
  return COMMAND_ESCAPES.reduce((escaped, [raw, code]) => escaped.split(raw).join(code), value);
}

// GitHub's workflow commands: the mask goes to the log before the value reaches any later step. With refOnly (the
// backup, whose steps take the URL itself) the password is masked but not handed on to every later step.
export function githubEnvLines({ ref, password }, { refOnly = false } = {}) {
  const passwordLine = refOnly ? '' : `SUPABASE_DB_PASSWORD=${password}\n`;
  return {
    log: `::add-mask::${escapeCommandValue(password)}\n`,
    env: `PROJECT_REF=${ref}\n${passwordLine}`,
  };
}

const STDIN = 0;
const REF_ONLY_OPTION = '--ref-only';

function main() {
  const value = readFileSync(STDIN, 'utf8').trim();
  const [envFile, option] = process.argv.slice(2);
  if (!value) throw new Error('SUPABASE_DB_URL is not set in this GitHub environment');
  if (!envFile) throw new Error('name the GITHUB_ENV file; run this inside a GitHub Actions job');
  const lines = githubEnvLines(parseSupabaseDbUrl(value), { refOnly: option === REF_ONLY_OPTION });
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
