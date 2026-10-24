import { describe, expect, it } from 'vitest';

import { auditChangesOf } from './audit-diff';

describe('auditChangesOf', () => {
  it('lists the columns an update changed, with both values', () => {
    expect(
      auditChangesOf(
        { id: 'p-1', role: 'admin_rw', rw_id: 5 },
        { id: 'p-1', role: 'superadmin', rw_id: null },
        { changed_columns: ['role', 'rw_id'] },
      ),
    ).toEqual([
      { column: 'role', before: 'admin_rw', after: 'superadmin' },
      { column: 'rw_id', before: '5', after: 'null' },
    ]);
  });

  it('names a private column without a value', () => {
    expect(
      auditChangesOf({ id: 'b-1' }, { id: 'b-1' }, { changed_columns: ['pic_phone'] }),
    ).toEqual([{ column: 'pic_phone', before: null, after: null }]);
  });

  it('shows an insert as values on the after side only', () => {
    expect(auditChangesOf(null, { status: 'issued', tags: ['a'] }, {})).toEqual([
      { column: 'status', before: null, after: 'issued' },
      { column: 'tags', before: null, after: '["a"]' },
    ]);
  });

  it('reads nothing from rows that are not objects', () => {
    expect(auditChangesOf('x', [1, 2], { changed_columns: 'role' })).toEqual([]);
  });
});
