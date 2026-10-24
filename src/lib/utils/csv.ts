// docs/Security.md §7.5 (Task P4.6.02): the CSV of a data export. UTF-8 with a byte-order mark, so Excel reads
// Indonesian text in the right encoding; RFC 4180 quoting; CRLF line ends; the watermark as the last line. Pure.

export const UTF8_BOM = '﻿';
const LINE_END = '\r\n';
const SEPARATOR = ',';
const QUOTE = '"';
// CSV (formula) injection, OWASP: a spreadsheet runs a cell that starts with = + - @, and a tab or carriage return in
// front of one hides it. Such text gets a leading apostrophe, which Excel and LibreOffice show as plain text.
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

export type CsvCell = string | number | boolean | null;

export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => CsvCell;
}

// Text that a spreadsheet would read as a formula, made inert. The XLSX writer uses it for its string cells too.
export function neutralizeFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

// A number is written as it is (a refund's -50000 stays a number); only text can carry a formula.
export function escapeCsvCell(cell: CsvCell): string {
  if (cell === null) return '';
  if (typeof cell !== 'string') return String(cell);
  const inert = neutralizeFormula(cell);
  return NEEDS_QUOTES.test(inert)
    ? `${QUOTE}${inert.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}`
    : inert;
}

function csvLine(cells: readonly CsvCell[]): string {
  return cells.map(escapeCsvCell).join(SEPARATOR);
}

// The header row, one line per row, an empty line, then the watermark ("Diekspor oleh …").
export function toCsv<Row>(
  columns: readonly CsvColumn<Row>[],
  rows: readonly Row[],
  watermark: string,
): string {
  const lines = [
    csvLine(columns.map((column) => column.header)),
    ...rows.map((row) => csvLine(columns.map((column) => column.value(row)))),
    '',
    csvLine([watermark]),
  ];
  return `${UTF8_BOM}${lines.join(LINE_END)}${LINE_END}`;
}
