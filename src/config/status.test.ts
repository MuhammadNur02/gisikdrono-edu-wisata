import { describe, expect, it } from 'vitest';

import { STATUS_META, statusMetaOf, type StatusKind } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';

const KINDS = Object.keys(STATUS_META) as StatusKind[];

describe('STATUS_META', () => {
  it('maps every value of every enum it covers, with a label and an icon', () => {
    for (const kind of KINDS) {
      const values: readonly string[] = DB_ENUMS[kind];
      const map: Record<string, { label: string } | undefined> = STATUS_META[kind];
      for (const value of values) {
        const meta = map[value];
        expect(meta, `${kind}.${value}`).toBeDefined();
        expect(meta?.label, `${kind}.${value}`).not.toBe('');
      }
      expect(Object.keys(map).toSorted()).toEqual([...values].toSorted());
    }
  });

  it('falls back to a neutral badge with the raw value for a value it does not know', () => {
    const meta = statusMetaOf('booking_status', 'on_hold' as never);
    expect(meta.tone).toBe('neutral');
    expect(meta.outline).toBe(true);
    expect(meta.label).toBe('on_hold');
  });
});
