import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { exportRequestSchema } from './export';

const REQUEST = {
  kind: 'attendance',
  format: 'xlsx',
  from: '2026-10-01',
  to: '2026-10-31',
  purpose: 'Rekap kehadiran bulanan RW',
};

function fieldErrorsOf(input: unknown): Record<string, string[] | undefined> {
  const result = exportRequestSchema.safeParse(input);
  return result.success ? {} : z.flattenError(result.error).fieldErrors;
}

describe('exportRequestSchema', () => {
  it('accepts a request of every kind and both formats', () => {
    for (const kind of ['visits', 'attendance', 'finance', 'audit']) {
      for (const format of ['csv', 'xlsx']) {
        expect(exportRequestSchema.safeParse({ ...REQUEST, kind, format }).success).toBe(true);
      }
    }
  });

  it('rejects an extra field, so no column list or RW can be smuggled in', () => {
    expect(exportRequestSchema.safeParse({ ...REQUEST, rwId: 8 }).success).toBe(false);
    expect(exportRequestSchema.safeParse({ ...REQUEST, columns: ['pic_phone'] }).success).toBe(
      false,
    );
  });

  it('rejects an unknown kind or format', () => {
    expect(fieldErrorsOf({ ...REQUEST, kind: 'participants' }).kind).toBeDefined();
    expect(fieldErrorsOf({ ...REQUEST, format: 'pdf' }).format).toBeDefined();
  });

  it('needs a purpose of 10 to 200 characters without a link', () => {
    expect(fieldErrorsOf({ ...REQUEST, purpose: 'Rekap' }).purpose).toEqual([
      'Tulis tujuan ekspor minimal 10 karakter.',
    ]);
    expect(fieldErrorsOf({ ...REQUEST, purpose: 'a'.repeat(201) }).purpose).toEqual([
      'Tujuan ekspor paling banyak 200 karakter.',
    ]);
    expect(fieldErrorsOf({ ...REQUEST, purpose: 'Lihat https://evil.test' }).purpose).toBeDefined();
    expect(exportRequestSchema.safeParse({ ...REQUEST, purpose: 'a'.repeat(200) }).success).toBe(
      true,
    );
  });

  it('rejects a period that ends before it starts', () => {
    expect(fieldErrorsOf({ ...REQUEST, from: '2026-10-31', to: '2026-10-01' }).to).toEqual([
      'Tanggal akhir tidak boleh sebelum tanggal awal.',
    ]);
  });

  it('allows twelve months at most, to the day before the same date next year', () => {
    expect(
      exportRequestSchema.safeParse({ ...REQUEST, from: '2026-03-15', to: '2027-03-14' }).success,
    ).toBe(true);
    expect(fieldErrorsOf({ ...REQUEST, from: '2026-03-15', to: '2027-03-15' }).to).toEqual([
      'Periode ekspor paling lama 12 bulan.',
    ]);
    expect(
      exportRequestSchema.safeParse({ ...REQUEST, from: '2026-01-01', to: '2026-12-31' }).success,
    ).toBe(true);
  });

  it('rejects a date that is not on the calendar', () => {
    expect(fieldErrorsOf({ ...REQUEST, from: '2026-02-30' }).from).toBeDefined();
  });
});
