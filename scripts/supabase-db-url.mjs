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
// The backup's login role (restore-drills.md, part A; 20261104230000_backup_reader.sql).
const BACKUP_LOGIN_ROLE = 'gisikdrono_backup';
// The session pooler's port and Supabase's one database, when the URL leaves them out.
const DEFAULT_PORT = '5432';
const DEFAULT_DATABASE = 'postgres';
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
  requireOnlySslMode(url);
  return {
    ref: projectRefOf(url),
    password: passwordOf(url),
    user: decodeURIComponent(url.username),
    host: url.hostname,
    port: url.port || DEFAULT_PORT,
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || DEFAULT_DATABASE,
  };
}

// The one parameter a URL may carry is sslmode=verify-full: a root certificate, client certificate or key named in
// the URL would override the pinned CA the job checks against (fourth review of PR #98, info).
function requireOnlySslMode(url) {
  for (const key of url.searchParams.keys()) {
    if (key !== 'sslmode')
      throw new Error(`SUPABASE_DB_URL carries ${key}; leave every parameter out`);
  }
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode !== null && sslMode !== VERIFIED_SSL_MODE) {
    throw new Error(
      `SUPABASE_DB_URL asks for sslmode=${sslMode}; leave it out or use ${VERIFIED_SSL_MODE}`,
    );
  }
}

function shellQuote(value) {
  return `'${value.split("'").join(`'\\''`)}'`;
}

// libpq's own variables for one step's shell (fourth review of PR #98, L1): psql, pg_dump and the Supabase CLI then
// run without a URL, so the password never sits in a process's arguments, and it lives only as long as that step.
// SUPABASE_DB_PASSWORD is the CLI's own name for it.
export function libpqExports({ host, port, database, user, password }) {
  const variables = {
    PGHOST: host,
    PGPORT: port,
    PGDATABASE: database,
    PGUSER: user,
    PGPASSWORD: password,
    SUPABASE_DB_PASSWORD: password,
  };
  return Object.entries(variables)
    .map(
      ([name, value]) => `export ${name}=${shellQuote(value)}
`,
    )
    .join('');
}

// Each job connects as its own role only (delta review of PR #98, N2): the backup as gisikdrono_backup, the release
// as postgres. A URL of any other role stops the job before it reaches the database.
const ROLE_BY_JOB = { '--backup': BACKUP_LOGIN_ROLE, '--release': 'postgres' };

export function requireJobRole({ user }, job) {
  const role = ROLE_BY_JOB[job];
  if (role === undefined) throw new Error(`unknown job ${String(job)}; use --backup or --release`);
  if (user !== role && !user.startsWith(`${role}.`)) {
    throw new Error(`SUPABASE_DB_URL is not the pooler URL of ${role}.<ref>`);
  }
}

export function escapeCommandValue(value) {
  return COMMAND_ESCAPES.reduce((escaped, [raw, code]) => escaped.split(raw).join(code), value);
}

// GitHub's workflow commands: the mask goes to the log before the value reaches any later step, and only the ref is
// handed on to the job; each step that connects takes its own --libpq variables.
export function githubEnvLines({ ref, password }) {
  return {
    log: `::add-mask::${escapeCommandValue(password)}
`,
    env: `PROJECT_REF=${ref}
`,
  };
}

const STDIN = 0;
// A step's own connection (fourth review of PR #98, L1):
//   connection="$(node scripts/supabase-db-url.mjs --libpq --backup <<< "$SUPABASE_DB_URL")"; eval "$connection"
const LIBPQ_OPTION = '--libpq';

function readUrl() {
  const value = readFileSync(STDIN, 'utf8').trim();
  if (!value) throw new Error('SUPABASE_DB_URL is not set in this GitHub environment');
  return parseSupabaseDbUrl(value);
}

function writeLibpqExports(job) {
  const target = readUrl();
  requireJobRole(target, job);
  process.stdout.write(libpqExports(target));
}

// The first step of a job (third review of PR #98, I3): node scripts/supabase-db-url.mjs "$GITHUB_ENV" --backup.
function writeGithubEnv(envFile, job) {
  if (!envFile) throw new Error('name the GITHUB_ENV file; run this inside a GitHub Actions job');
  const target = readUrl();
  requireJobRole(target, job);
  const lines = githubEnvLines(target);
  process.stdout.write(lines.log);
  appendFileSync(envFile, lines.env);
}

function main() {
  const [first, job] = process.argv.slice(2);
  if (first === LIBPQ_OPTION) writeLibpqExports(job);
  else writeGithubEnv(first, job);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    // stderr, so a step that evaluates --libpq's output never runs the message; the runner reads both streams.
    process.stderr.write(
      `::error::${error instanceof Error ? error.message : 'unreadable SUPABASE_DB_URL'}\n`,
    );
    process.exitCode = 1;
  }
}
