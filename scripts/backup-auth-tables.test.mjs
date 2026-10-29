import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// Reviews of PR #98 (delta L3, fourth H1 and H2): what the backup reads is named in three places that must agree.
// backup.yml hands pg_dump its schemas, and pgTAP backup_reader.sql proves the role may use each of them; the snapshot
// function of the migration reads its auth tables, and pgTAP classifies those as the copied ones. The migration is the
// latest one that defines the function, since a later migration replaces it (follow-up of the review of PR #98).

const workflow = readFileSync(new URL('../.github/workflows/backup.yml', import.meta.url), 'utf8');
const suite = readFileSync(new URL('../supabase/tests/backup_reader.sql', import.meta.url), 'utf8');
const migrationsDirectory = new URL('../supabase/migrations/', import.meta.url);
const DEFINES_SNAPSHOT = /create (or replace )?function internal\.backup_auth_snapshot\(\)/;

function latestSnapshotMigration() {
  const names = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const defining = names.filter((name) =>
    DEFINES_SNAPSHOT.test(readFileSync(new URL(name, migrationsDirectory), 'utf8')),
  );
  return defining.at(-1);
}

const migrationName = latestSnapshotMigration();
const migration =
  migrationName === undefined
    ? ''
    : readFileSync(new URL(migrationName, migrationsDirectory), 'utf8');

const quoted = (text) => [...text.matchAll(/'([a-z_]+)'/g)].map(([, name]) => name).sort();

function schemasInWorkflow() {
  return [...workflow.matchAll(/--schema=([a-z_]+)/g)].map(([, schema]) => schema).sort();
}

function schemasInSuite() {
  const listed =
    /-- backup\.yml schemas:\s*\n[^\n]*unnest\(array\[([^\]]*)\]\)/.exec(suite)?.[1] ?? '';
  return quoted(listed);
}

function snapshotTables() {
  return [...migration.matchAll(/from auth\.([a-z_]+) r\)/g)].map(([, table]) => table).sort();
}

function copiedInSuite() {
  const listed =
    /-- the snapshot copies:\s*\n\s*and t\.tablename not in \(([^)]*)\)/.exec(suite)?.[1] ?? '';
  return quoted(listed);
}

describe('what the backup reads', () => {
  it('dumps only schemas pgTAP proves the role may use, never auth', () => {
    expect(schemasInWorkflow()).toEqual(['public']);
    expect(schemasInSuite()).toEqual(schemasInWorkflow());
    expect(workflow).not.toMatch(/--schema=auth|--exclude-table/);
  });

  it('reads the migration that defines the snapshot last', () => {
    expect(migrationName).toBeDefined();
    expect(migration).toContain('backup_reader');
  });

  it('snapshots exactly the auth tables pgTAP classifies as copied', () => {
    expect(snapshotTables()).toHaveLength(5);
    expect(copiedInSuite()).toEqual(snapshotTables());
  });
});
