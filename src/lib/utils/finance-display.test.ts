import { describe, expect, it } from 'vitest';

import { netSeries, numberOrNull, partyLabel, periodDays, ruleState } from './finance-display';

describe('partyLabel', () => {
  it('names the kelurahan, an RW treasury and a vendor', () => {
    expect(partyLabel('kelurahan', null)).toBe('Kelurahan Gisikdrono');
    expect(partyLabel('rw:5', 'RW 05 Ecowastreme')).toBe('Kas RW 05 Ecowastreme');
    expect(partyLabel('rw:8', null)).toBe('Kas RW 08');
    expect(partyLabel('vendor:0192f3a4-5b6c-7d8e-9f01-000000000001', 'Kompos Bu Sri')).toBe('UMKM Kompos Bu Sri');
    expect(partyLabel('vendor:0192f3a4-5b6c-7d8e-9f01-000000000001', null)).toBe('UMKM Pihak tidak dikenal');
  });

  it('falls back to the given name, or says it does not know', () => {
    expect(partyLabel('lain', 'Lainnya')).toBe('Lainnya');
    expect(partyLabel('lain', null)).toBe('Pihak tidak dikenal');
  });
});

describe('ruleState', () => {
  const today = '2026-10-25';

  it('reads a version as upcoming, in force or closed', () => {
    expect(ruleState({ effectiveFrom: '2026-11-01', effectiveTo: null }, today)).toBe('upcoming');
    expect(ruleState({ effectiveFrom: '2026-10-01', effectiveTo: null }, today)).toBe('inForce');
    expect(ruleState({ effectiveFrom: '2026-10-01', effectiveTo: '2026-10-25' }, today)).toBe('inForce');
    expect(ruleState({ effectiveFrom: '2026-09-01', effectiveTo: '2026-10-24' }, today)).toBe('closed');
  });
});

describe('periodDays and netSeries', () => {
  const period = { from: '2026-10-29', to: '2026-11-02' };

  it('lists every day of a period across a month end', () => {
    expect(periodDays(period)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('puts the net of each day in order, zero for a quiet one', () => {
    const day = { grossSettled: 0, refunds: 0, paymentsCount: 1, qrisCount: 1, vaCount: 0 };
    expect(
      netSeries(
        [
          { ...day, day: '2026-10-30', net: 300_000 },
          { ...day, day: '2026-11-02', net: 150_000 },
        ],
        period,
      ).map((point) => point.value),
    ).toEqual([0, 300_000, 0, 0, 150_000]);
  });
});

describe('numberOrNull', () => {
  it('reads an empty option as null and any other as its number', () => {
    expect(numberOrNull('')).toBeNull();
    expect(numberOrNull('8')).toBe(8);
  });
});
