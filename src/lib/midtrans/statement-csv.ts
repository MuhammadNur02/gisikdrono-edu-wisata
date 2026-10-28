// Task P4.7.05 (docs/Security.md REC-02): the transaction statement the Midtrans dashboard exports, read down to the
// three columns the comparison needs. RFC 4180 quoting; a comma, semicolon or tab between cells, whichever the header
// line uses; the header names matched loosely ("Order ID", "Transaction Status" or "Status", "Gross Amount" or
// "Amount"). Amounts are whole rupiah in any of the shapes a spreadsheet leaves behind ("300000.00", "300.000",
// "Rp 1.250.000,00"); one with cents is refused, as isSameAmount refuses it. Pure; import_midtrans_statement checks
// the same shape again and does the comparison. Review of PR #99: a status Midtrans' map does not know is refused
// with its record numbers (L2), the rows sent stay under the Server Action's body limit (L3), and the period of the
// statement's transaction times, when the file has them, goes with the rows (Info).

// Mirrors max_rows of public.import_midtrans_statement (20261104210200).
export const STATEMENT_MAX_ROWS = 5000;
// L3: the rows as sent stay below the 512 KB body limit of a Server Action (next.config.ts), with room for the rest:
// 450 KB (450 x 1024 bytes).
export const STATEMENT_MAX_PAYLOAD_BYTES = 460_800;
// L2: the statuses internal.midtrans_payment_status maps (20261024090100); import_midtrans_statement refuses any other.
export const MIDTRANS_STATEMENT_STATUSES = [
  'settlement',
  'capture',
  'pending',
  'deny',
  'failure',
  'cancel',
  'expire',
  'refund',
  'partial_refund',
  'chargeback',
  'partial_chargeback',
] as const;

export interface StatementRow {
  orderId: string;
  status: string;
  grossAmount: string;
}

// The first and last Jakarta day of the statement's transactions, as YYYY-MM-DD.
export interface StatementPeriod {
  from: string;
  to: string;
}

export type StatementProblem =
  | 'unreadable'
  | 'columns'
  | 'empty'
  | 'too_many_rows'
  | 'rows'
  | 'unknown_status'
  | 'duplicates'
  | 'too_large';

export type StatementParse =
  | { ok: true; rows: StatementRow[]; period: StatementPeriod | null }
  | { ok: false; problem: StatementProblem; records: number[] };

type Column = keyof StatementRow;

const QUOTE = '"';
const SEPARATORS = [',', ';', '\t'] as const;
// Spreadsheets save a UTF-8 file with this mark in front of the first header name.
const BYTE_ORDER_MARK_CODE_POINT = 0xfeff;
const BYTE_ORDER_MARK = String.fromCodePoint(BYTE_ORDER_MARK_CODE_POINT);
const HEADER_ALIASES: Readonly<Record<Column, readonly string[]>> = {
  orderId: ['order id'],
  status: ['transaction status', 'status'],
  grossAmount: ['gross amount', 'amount'],
};
// Info: the column the period is read from, when the export has it.
const TIME_ALIASES = ['transaction time', 'transaction date'] as const;
const DAY_PREFIX = /^(\d{4}-\d{2}-\d{2})/;
// The row shape import_midtrans_statement accepts, shared with the action's schema.
export const STATEMENT_ORDER_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
export const STATEMENT_STATUS = /^[a-z_]{1,40}$/;
export const STATEMENT_AMOUNT = /^[0-9]{1,15}$/;
const CURRENCY_PREFIX = /^(?:rp\.?|idr)/i;
const AMOUNT = /^(\d+|\d{1,3}(?:[.,]\d{3})+)(?:([.,])(\d{1,2}))?$/;
const GROUP_SEPARATOR = /[.,]/g;
const ZEROS = /^0+$/;
const LEADING_ZEROS = /^0+(?=\d)/;
// The header is record 1, so the first statement row is record 2, as a spreadsheet numbers it.
const FIRST_ROW_RECORD = 2;

interface CsvReader {
  records: string[][];
  record: string[];
  cell: string;
  quoted: boolean;
}

function endRecord(reader: CsvReader): void {
  reader.records.push([...reader.record, reader.cell]);
  reader.record = [];
  reader.cell = '';
}

// A character outside quotes: it ends a cell, ends a record, or belongs to the cell.
function readPlain(reader: CsvReader, char: string, separator: string): void {
  if (char === separator) {
    reader.record.push(reader.cell);
    reader.cell = '';
  } else if (char === '\n') {
    endRecord(reader);
  } else if (char !== '\r') {
    reader.cell += char;
  }
}

// The records of the text, or null when a quoted cell never closes.
export function csvRecords(text: string, separator: string): string[][] | null {
  const reader: CsvReader = { records: [], record: [], cell: '', quoted: false };
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    const isDoubledQuote = reader.quoted && char === QUOTE && text.charAt(index + 1) === QUOTE;
    if (isDoubledQuote) {
      reader.cell += QUOTE;
      index += 1;
    } else if (char === QUOTE) {
      reader.quoted = !reader.quoted;
    } else if (reader.quoted) {
      reader.cell += char;
    } else {
      readPlain(reader, char, separator);
    }
  }
  if (reader.quoted) return null;
  if (reader.cell !== '' || reader.record.length > 0) endRecord(reader);
  return reader.records;
}

// The separator the header line uses most.
export function detectSeparator(text: string): string {
  const header = text.split('\n', 1)[0] ?? '';
  const count = (separator: string): number => header.split(separator).length;
  return SEPARATORS.reduce((best, separator) =>
    count(separator) > count(best) ? separator : best,
  );
}

function headerName(cell: string): string {
  return cell
    .replaceAll(BYTE_ORDER_MARK, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
}

// Where each needed column sits in the header, or null when one is missing.
export function columnIndexes(header: readonly string[]): Record<Column, number> | null {
  const names = header.map(headerName);
  const indexOf = (column: Column): number =>
    HEADER_ALIASES[column].map((alias) => names.indexOf(alias)).find((index) => index >= 0) ?? -1;
  const indexes = {
    orderId: indexOf('orderId'),
    status: indexOf('status'),
    grossAmount: indexOf('grossAmount'),
  };
  return Object.values(indexes).every((index) => index >= 0) ? indexes : null;
}

// Where the transaction time sits in the header, or -1.
export function timeIndex(header: readonly string[]): number {
  const names = header.map(headerName);
  return TIME_ALIASES.map((alias) => names.indexOf(alias)).find((index) => index >= 0) ?? -1;
}

// The digits of an amount's integer part, or null when it groups with two separators or with its decimal one.
function integerDigits(integer: string, decimalSeparator: string | undefined): string | null {
  const groupSeparators = new Set(integer.match(GROUP_SEPARATOR));
  if (groupSeparators.size > 1) return null;
  if (decimalSeparator !== undefined && groupSeparators.has(decimalSeparator)) return null;
  return integer.replace(GROUP_SEPARATOR, '').replace(LEADING_ZEROS, '');
}

// A whole-rupiah amount as plain digits, or null for anything else (cents, mixed separators, words).
export function wholeRupiah(raw: string): string | null {
  const match = AMOUNT.exec(raw.replace(/\s/g, '').replace(CURRENCY_PREFIX, ''));
  if (!match) return null;
  const [, integer = '', decimalSeparator, fraction = '0'] = match;
  if (!ZEROS.test(fraction)) return null;
  const digits = integerDigits(integer, decimalSeparator);
  return digits !== null && STATEMENT_AMOUNT.test(digits) ? digits : null;
}

// "Settlement" and "Partial Refund" as Midtrans' own settlement and partial_refund.
export function statementStatus(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function rowOf(record: readonly string[], indexes: Record<Column, number>): StatementRow | null {
  const orderId = (record[indexes.orderId] ?? '').trim();
  const status = statementStatus(record[indexes.status] ?? '');
  const grossAmount = wholeRupiah(record[indexes.grossAmount] ?? '');
  if (!STATEMENT_ORDER_ID.test(orderId) || !STATEMENT_STATUS.test(status) || grossAmount === null)
    return null;
  return { orderId, status, grossAmount };
}

export function isKnownStatus(status: string): boolean {
  return (MIDTRANS_STATEMENT_STATUSES as readonly string[]).includes(status);
}

// L3: the size of the rows as the browser sends them.
export function statementPayloadBytes(rows: readonly StatementRow[]): number {
  return new TextEncoder().encode(JSON.stringify(rows)).length;
}

// The first and last day the time column names, or null when it names none.
export function statementPeriod(
  records: readonly (readonly string[])[],
  index: number,
): StatementPeriod | null {
  if (index < 0) return null;
  const days = records
    .map((record) => DAY_PREFIX.exec((record[index] ?? '').trim())?.[1])
    .filter((day): day is string => day !== undefined)
    .sort();
  const [from] = days;
  const to = days.at(-1);
  return from && to ? { from, to } : null;
}

function isBlank(record: readonly string[]): boolean {
  return record.every((cell) => cell.trim() === '');
}

type StatementFailure = Extract<StatementParse, { ok: false }>;
interface NumberedRecord {
  record: string[];
  number: number;
}

function failure(problem: StatementProblem, records: number[] = []): StatementFailure {
  return { ok: false, problem, records };
}

// The statement's non-blank records after its header, numbered as a spreadsheet numbers them, with the columns.
function statementRecords(
  text: string,
): { body: NumberedRecord[]; indexes: Record<Column, number>; time: number } | StatementFailure {
  const records = csvRecords(text, detectSeparator(text));
  if (records === null) return failure('unreadable');
  const [header = [], ...rest] = records;
  const indexes = columnIndexes(header);
  if (indexes === null) return failure('columns');
  const body = rest
    .map((record, index) => ({ record, number: index + FIRST_ROW_RECORD }))
    .filter(({ record }) => !isBlank(record));
  if (body.length === 0) return failure('empty');
  if (body.length > STATEMENT_MAX_ROWS) return failure('too_many_rows');
  return { body, indexes, time: timeIndex(header) };
}

// The record numbers of each order that appears again after its first row.
function duplicateRecords(rows: readonly { row: StatementRow; number: number }[]): number[] {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  for (const { row, number } of rows) {
    if (seen.has(row.orderId)) duplicates.push(number);
    seen.add(row.orderId);
  }
  return duplicates;
}

// The rows of a statement, or the problem with it and the record numbers it is in.
export function parseMidtransStatement(text: string): StatementParse {
  const read = statementRecords(text);
  if ('ok' in read) return read;
  const parsed = read.body.map(({ record, number }) => ({
    row: rowOf(record, read.indexes),
    number,
  }));
  const readable = parsed.flatMap(({ row, number }) => (row ? [{ row, number }] : []));
  if (readable.length < parsed.length) {
    return failure(
      'rows',
      parsed.filter(({ row }) => row === null).map(({ number }) => number),
    );
  }
  const unknown = readable.filter(({ row }) => !isKnownStatus(row.status));
  if (unknown.length > 0) return failure('unknown_status', unknown.map(({ number }) => number));
  const duplicates = duplicateRecords(readable);
  if (duplicates.length > 0) return failure('duplicates', duplicates);
  const rows = readable.map(({ row }) => row);
  if (statementPayloadBytes(rows) > STATEMENT_MAX_PAYLOAD_BYTES) return failure('too_large');
  const period = statementPeriod(
    read.body.map(({ record }) => record),
    read.time,
  );
  return { ok: true, rows, period };
}
