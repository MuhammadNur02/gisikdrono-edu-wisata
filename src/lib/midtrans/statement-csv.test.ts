import { describe, expect, it } from 'vitest';

import {
  MIDTRANS_STATEMENT_STATUSES,
  STATEMENT_MAX_PAYLOAD_BYTES,
  STATEMENT_MAX_ROWS,
  columnIndexes,
  csvRecords,
  detectSeparator,
  parseMidtransStatement,
  statementStatus,
  wholeRupiah,
} from '@/lib/midtrans/statement-csv';

const HEADER = 'Order ID,Transaction ID,Transaction Status,Payment Type,Gross Amount';

function statement(...lines: string[]): string {
  return [HEADER, ...lines].join('\r\n');
}

describe('csvRecords', () => {
  it('reads quoted cells with separators, doubled quotes and line breaks inside', () => {
    expect(csvRecords('a,"b,c","say ""hi""","x\ny"\r\n1,2,3,4', ',')).toEqual([
      ['a', 'b,c', 'say "hi"', 'x\ny'],
      ['1', '2', '3', '4'],
    ]);
  });

  it('keeps empty cells and refuses a quote that never closes', () => {
    expect(csvRecords('a,,""\n', ',')).toEqual([['a', '', '']]);
    expect(csvRecords('a,"b\n', ',')).toBeNull();
  });
});

describe('detectSeparator', () => {
  it('takes the separator the header line uses most', () => {
    expect(detectSeparator('Order ID;Status;Amount\n1,5;2;3')).toBe(';');
    expect(detectSeparator('Order ID\tStatus\tAmount')).toBe('\t');
    expect(detectSeparator(HEADER)).toBe(',');
  });
});

describe('columnIndexes', () => {
  it('finds the three columns by their loose names, the transaction status before a bare status', () => {
    expect(
      columnIndexes([
        `${String.fromCodePoint(0xfeff)}Order ID`,
        'Status',
        'Transaction Status',
        'Amount',
      ]),
    ).toEqual({
      orderId: 0,
      status: 2,
      grossAmount: 3,
    });
    expect(columnIndexes(['order_id', 'STATUS', 'gross-amount'])).toEqual({
      orderId: 0,
      status: 1,
      grossAmount: 2,
    });
  });

  it('is null when one is missing', () => {
    expect(columnIndexes(['Order ID', 'Status'])).toBeNull();
  });
});

describe('wholeRupiah', () => {
  it.each([
    ['300000', '300000'],
    ['300000.00', '300000'],
    ['300000,0', '300000'],
    ['300.000', '300000'],
    ['300,000.00', '300000'],
    ['Rp 1.250.000,00', '1250000'],
    ['IDR 75,000', '75000'],
    ['Rp.50.000', '50000'],
    ['000120', '120'],
    ['0', '0'],
  ])('reads %s as %s', (raw, digits) => {
    expect(wholeRupiah(raw)).toBe(digits);
  });

  it.each([
    '300000.50',
    '1,5',
    '1.000,000',
    '300.000.00',
    '-50000',
    '6e5',
    'gratis',
    '',
    '1234567890123456',
  ])('refuses %s', (raw) => {
    expect(wholeRupiah(raw)).toBeNull();
  });
});

describe('statementStatus', () => {
  it('writes the dashboard status as Midtrans names it', () => {
    expect(statementStatus(' Settlement ')).toBe('settlement');
    expect(statementStatus('Partial Refund')).toBe('partial_refund');
    expect(statementStatus('partial-chargeback')).toBe('partial_chargeback');
  });
});

describe('parseMidtransStatement: a readable statement', () => {
  it('keeps the order, status and amount of each row and skips blank lines', () => {
    const text = statement(
      'GSK-7F3K9Q2M-01,tx-1,Settlement,qris,"300,000.00"',
      ',,,,',
      'GSK-7F3K9Q2M-02,tx-2,expire,bca_va,300000.00',
      '',
    );
    expect(parseMidtransStatement(text)).toEqual({
      ok: true,
      rows: [
        { orderId: 'GSK-7F3K9Q2M-01', status: 'settlement', grossAmount: '300000' },
        { orderId: 'GSK-7F3K9Q2M-02', status: 'expire', grossAmount: '300000' },
      ],
      period: null,
    });
  });

  it('reads a semicolon export with Indonesian amounts', () => {
    const text = 'Order ID;Status;Amount\nGSK-7F3K9Q2M-01;settlement;1.250.000,00\n';
    expect(parseMidtransStatement(text)).toEqual({
      ok: true,
      rows: [{ orderId: 'GSK-7F3K9Q2M-01', status: 'settlement', grossAmount: '1250000' }],
      period: null,
    });
  });

  it('reads the period from the transaction times, when the file has them (review of PR #99, Info)', () => {
    const text = [
      'Order ID,Transaction Time,Transaction Status,Gross Amount',
      'GSK-A,2026-10-31 23:10:00,settlement,1000',
      'GSK-B,2026-10-02 08:00:00,expire,1000',
      'GSK-C,,pending,1000',
    ].join('\n');
    expect(parseMidtransStatement(text)).toMatchObject({
      ok: true,
      period: { from: '2026-10-02', to: '2026-10-31' },
    });
  });
});

describe('parseMidtransStatement: a statement it refuses', () => {
  it('names the file problems', () => {
    expect(parseMidtransStatement('Order ID,"Status\n')).toEqual({
      ok: false,
      problem: 'unreadable',
      records: [],
    });
    expect(parseMidtransStatement('Order ID,Amount\nx,1')).toEqual({
      ok: false,
      problem: 'columns',
      records: [],
    });
    expect(parseMidtransStatement(statement(',,,,'))).toEqual({
      ok: false,
      problem: 'empty',
      records: [],
    });
  });

  it('refuses more rows than one import compares', () => {
    const rows = Array.from(
      { length: STATEMENT_MAX_ROWS + 1 },
      (_, index) => `GSK-A-${String(index)},t,pending,q,1`,
    );
    expect(parseMidtransStatement(statement(...rows))).toMatchObject({
      ok: false,
      problem: 'too_many_rows',
    });
  });

  it('names the records it cannot read, as a spreadsheet numbers them', () => {
    const text = statement(
      'GSK-7F3K9Q2M-01,t,settlement,q,1000',
      'bad id!,t,settlement,q,1000',
      'GSK-B,t,?,q,1000',
    );
    expect(parseMidtransStatement(text)).toEqual({ ok: false, problem: 'rows', records: [3, 4] });
  });

  it('names the records whose status the Midtrans map does not know (review of PR #99, L2)', () => {
    const text = statement('GSK-A,t,settlement,q,1000', 'GSK-B,t,authorize,q,1000');
    expect(parseMidtransStatement(text)).toEqual({
      ok: false,
      problem: 'unknown_status',
      records: [3],
    });
    expect(MIDTRANS_STATEMENT_STATUSES).toContain('partial_chargeback');
  });

  it('refuses rows past the payload cap (L3)', () => {
    const rows = Array.from(
      { length: STATEMENT_MAX_ROWS },
      (_, index) => `GSK-${'X'.repeat(48)}-${String(index)},t,pending,q,1`,
    );
    expect(parseMidtransStatement(statement(...rows))).toMatchObject({
      ok: false,
      problem: 'too_large',
    });
    expect(STATEMENT_MAX_PAYLOAD_BYTES).toBe(460_800);
  });

  it('and the records that list an order again', () => {
    const text = statement(
      'GSK-A,t,settlement,q,1000',
      'GSK-B,t,settlement,q,1000',
      'GSK-A,t,refund,q,1000',
    );
    expect(parseMidtransStatement(text)).toEqual({
      ok: false,
      problem: 'duplicates',
      records: [4],
    });
  });
});
