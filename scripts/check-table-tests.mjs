// Fails when a table created by a migration is named in no pgTAP file (Task P1.9.01, docs/Security.md AZ-08):
// a new table merges only with a test that covers it (CLAUDE.md §6.4). A table counts as tested when a file in
// supabase/tests names it outside a comment; the helpers there build fixtures and do not count.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIGRATIONS_DIR = 'supabase/migrations';
const TESTS_DIR = 'supabase/tests';
const CREATE_TABLE = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi;
const LINE_COMMENT = /--.*$/gm;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

function withoutComments(sql) {
  return sql.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '');
}

export function tablesCreatedIn(sql) {
  return [...withoutComments(sql).matchAll(CREATE_TABLE)].map((match) => match[1].toLowerCase());
}

export function tablesWithoutTests(tables, testSources) {
  const tested = testSources.map(withoutComments).join('\n');
  return [...new Set(tables)]
    .filter((table) => !new RegExp(`\\b${table}\\b`, 'i').test(tested))
    .sort();
}

async function readSqlFiles(directory) {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  return Promise.all(names.map((name) => readFile(join(directory, name), 'utf8')));
}

async function main() {
  const migrations = await readSqlFiles(MIGRATIONS_DIR);
  const tables = migrations.flatMap(tablesCreatedIn);
  const missing = tablesWithoutTests(tables, await readSqlFiles(TESTS_DIR));
  if (missing.length > 0) {
    process.stderr.write(
      `These tables are named in no file of ${TESTS_DIR}; add a pgTAP test for each:\n${missing.join('\n')}\n`,
    );
    return 1;
  }
  process.stdout.write(
    `Every table has a pgTAP test: ${String(new Set(tables).size)} tables checked.\n`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}
