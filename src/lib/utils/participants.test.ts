import { describe, expect, it } from 'vitest';

import { findDuplicateRows, isMultiCellPaste, parseParticipantPaste } from './participants';

describe('parseParticipantPaste', () => {
  it('reads tab-separated rows from a spreadsheet', () => {
    expect(parseParticipantPaste('Ani Lestari\t5A\r\nBudi Santoso\t5B\n')).toEqual([
      { fullName: 'Ani Lestari', groupLabel: '5A' },
      { fullName: 'Budi Santoso', groupLabel: '5B' },
    ]);
  });

  it('reads comma-separated rows and names without a group', () => {
    expect(parseParticipantPaste('Citra, Guru\nDewi')).toEqual([
      { fullName: 'Citra', groupLabel: 'Guru' },
      { fullName: 'Dewi', groupLabel: '' },
    ]);
  });

  it('drops blank lines and rows without a name', () => {
    expect(parseParticipantPaste('\n\t5A\n  \nEka\t6')).toEqual([
      { fullName: 'Eka', groupLabel: '6' },
    ]);
  });
});

describe('isMultiCellPaste', () => {
  it('spots pastes that span cells or lines', () => {
    expect(isMultiCellPaste('Ani\t5A')).toBe(true);
    expect(isMultiCellPaste('Ani\nBudi')).toBe(true);
    expect(isMultiCellPaste('Ani Lestari')).toBe(false);
    expect(isMultiCellPaste('Ani Lestari\n')).toBe(false);
  });
});

describe('findDuplicateRows', () => {
  it('marks every row whose name repeats, ignoring case and spacing', () => {
    const rows = [
      { fullName: 'Ani Lestari', groupLabel: '5A' },
      { fullName: 'Budi', groupLabel: '5A' },
      { fullName: '  ani   lestari ', groupLabel: '5B' },
      { fullName: '', groupLabel: '' },
      { fullName: '', groupLabel: '' },
    ];
    expect([...findDuplicateRows(rows)].sort()).toEqual([0, 2]);
  });

  it('finds nothing in a list of distinct names', () => {
    expect(findDuplicateRows([{ fullName: 'Ani', groupLabel: '' }]).size).toBe(0);
  });
});
