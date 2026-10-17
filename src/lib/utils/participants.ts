import type { ParticipantRow } from '@/types/forms';

// A paste from Excel or Google Sheets arrives as tab-separated lines; a CSV export as comma-separated.
// The first column is the name, the second the class or group. Blank lines are dropped.
export function parseParticipantPaste(text: string): ParticipantRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(line.includes('\t') ? '\t' : ','))
    .map(([name = '', group = '']) => ({ fullName: name.trim(), groupLabel: group.trim() }))
    .filter((row) => row.fullName !== '');
}

// True when the text holds more than a single cell, so the editor should spread it over rows.
export function isMultiCellPaste(text: string): boolean {
  return /[\t\n]/.test(text.trim());
}

// Row indexes whose name appears more than once (case and spacing ignored). The editor highlights them
// and never blocks: two pupils can share a name (docs/StyleGuide.md §5.6).
export function findDuplicateRows(rows: readonly ParticipantRow[]): Set<number> {
  const indexesByName = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = row.fullName.trim().replace(/\s+/g, ' ').toLowerCase();
    if (key === '') return;
    indexesByName.set(key, [...(indexesByName.get(key) ?? []), index]);
  });
  return new Set([...indexesByName.values()].filter((indexes) => indexes.length > 1).flat());
}
