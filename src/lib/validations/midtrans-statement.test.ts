import { describe, expect, it } from 'vitest';

import { STATEMENT_MAX_ROWS } from '@/lib/midtrans/statement-csv';
import {
  importStatementFormSchema,
  importStatementSchema,
} from '@/lib/validations/midtrans-statement';

const ROW = { orderId: 'GSK-7F3K9Q2M-01', status: 'settlement', grossAmount: '300000' };

describe('importStatementSchema', () => {
  it('takes a file name and the rows the browser read', () => {
    expect(importStatementSchema.parse({ fileName: ' midtrans.csv ', rows: [ROW] })).toEqual({
      fileName: 'midtrans.csv',
      rows: [ROW],
    });
  });

  it('drops control characters and path separators from the file name', () => {
    const parsed = importStatementSchema.parse({
      fileName: '..\\laporan/okt\u0007.csv',
      rows: [ROW],
    });
    expect(parsed.fileName).toBe('..laporanokt.csv');
  });

  it('refuses extra fields, on the form and on a row', () => {
    expect(
      importStatementSchema.safeParse({ fileName: 'a.csv', rows: [ROW], total: 1 }).success,
    ).toBe(false);
    expect(
      importStatementSchema.safeParse({ fileName: 'a.csv', rows: [{ ...ROW, price: 1 }] }).success,
    ).toBe(false);
  });

  it.each([
    ['an empty statement', []],
    ['an order twice', [ROW, ROW]],
    ['cents', [{ ...ROW, grossAmount: '300000.50' }]],
    ['a status Midtrans does not spell so', [{ ...ROW, status: 'Settlement' }]],
    ['an order id with spaces', [{ ...ROW, orderId: 'GSK 1' }]],
    [
      'too many rows',
      Array.from({ length: STATEMENT_MAX_ROWS + 1 }, (_, index) => ({
        ...ROW,
        orderId: `O-${String(index)}`,
      })),
    ],
  ])('refuses %s', (_, rows) => {
    expect(importStatementSchema.safeParse({ fileName: 'a.csv', rows }).success).toBe(false);
  });

  it('refuses a name that is only unsafe characters', () => {
    expect(importStatementSchema.safeParse({ fileName: '//', rows: [ROW] }).success).toBe(false);
  });
});

describe('importStatementFormSchema', () => {
  it('carries the authenticator code of the step-up as well', () => {
    expect(
      importStatementFormSchema.safeParse({ fileName: 'a.csv', rows: [ROW], code: '123456' })
        .success,
    ).toBe(true);
    expect(importStatementFormSchema.safeParse({ fileName: 'a.csv', rows: [ROW] }).success).toBe(
      false,
    );
  });
});
