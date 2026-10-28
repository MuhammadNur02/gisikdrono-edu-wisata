import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// Reviews of PR #98 (delta L3, fourth H1 and H2): what the backup reads is named in three places that must agree.
// backup.yml hands pg_dump its schemas, and pgTAP backup_reader.sql proves the role may use each of them; the snapshot
// function of the migration reads its auth tables, and pgTAP classifies those as the copied ones.

const workflow = readFileSync(new URL('../.github/workflows/backup.yml', import.meta.url), 'utf8');
const suite = readFileSync(new URL('../supabase/tests/backup_reader.sql', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL('../supabase/migrations/20261104230000_backup_reader.sql', import.meta.url),
  'utf8',
);

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

  it('snapshots exactly the auth tables pgTAP classifies as copied', () => {
    expect(snapshotTables()).toHaveLength(5);
    expect(copiedInSuite()).toEqual(snapshotTables());
  });
});
