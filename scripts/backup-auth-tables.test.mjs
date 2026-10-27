import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// Review of PR #98, delta L3: the auth tables whose data the backup leaves out are named twice, in backup.yml's
// pg_dump call and in pgTAP backup_reader.sql, which fails on an auth table that neither copies nor leaves out. The
// two lists must stay one list.

const workflow = readFileSync(new URL('../.github/workflows/backup.yml', import.meta.url), 'utf8');
const suite = readFileSync(new URL('../supabase/tests/backup_reader.sql', import.meta.url), 'utf8');

function excludedInWorkflow() {
  return [...workflow.matchAll(/--exclude-table='?auth\.([a-z_*]+)'?/g)]
    .map(([, table]) => table)
    .sort();
}

function excludedInSuite() {
  const listed =
    /-- backup\.yml excludes:\s*\n\s*and t\.tablename not in \(([^)]*)\)/.exec(suite)?.[1] ?? '';
  const names = [...listed.matchAll(/'([a-z_]+)'/g)].map(([, table]) => table);
  const patterns = [...suite.matchAll(/t\.tablename not like '([a-z]+)\\_%'/g)].map(
    ([, prefix]) => `${prefix}_*`,
  );
  return [...names, ...patterns].sort();
}

describe('the auth tables the backup leaves out', () => {
  it('are the same in backup.yml and in pgTAP backup_reader.sql', () => {
    // Left out whole, never their data alone (third review of PR #98, D1).
    expect(workflow).not.toContain('--exclude-table-data');
    expect(excludedInWorkflow().length).toBeGreaterThan(0);
    expect(excludedInWorkflow()).toEqual(excludedInSuite());
  });
});
