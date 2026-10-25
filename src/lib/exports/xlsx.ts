import 'server-only';

import ExcelJS from 'exceljs';

import { neutralizeFormula, type CsvCell, type CsvColumn } from '@/lib/utils/csv';

// docs/Security.md §7.5 (Task P4.6.02): the XLSX of a data export. One sheet: the bold header row, frozen, one row per
// record, an empty row and the watermark, which the printed page repeats as its footer. Every string cell goes through
// neutralizeFormula, as the CSV cells do (CSV/formula injection), and numbers stay numbers, so a refund's -50000 sums.

const SHEET_NAME = 'Ekspor';
const MIN_COLUMN_WIDTH = 10;
const MAX_COLUMN_WIDTH = 48;
// Room beside the header text, in characters.
const COLUMN_PADDING = 2;
// In a header or footer `&` starts a code (&P, &D), so a literal one is written twice.
const FOOTER_AMPERSAND = /&/g;

export function xlsxCellValue(cell: CsvCell): string | number | boolean | null {
  return typeof cell === 'string' ? neutralizeFormula(cell) : cell;
}

function columnWidth(header: string): number {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, header.length + COLUMN_PADDING));
}

function addSheet<Row>(
  workbook: ExcelJS.Workbook,
  columns: readonly CsvColumn<Row>[],
  watermark: string,
) {
  const sheet = workbook.addWorksheet(SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 1 }],
    headerFooter: { oddFooter: `&L${watermark.replace(FOOTER_AMPERSAND, '&&')}` },
  });
  sheet.columns = columns.map((column) => ({
    header: neutralizeFormula(column.header),
    width: columnWidth(column.header),
  }));
  sheet.getRow(1).font = { bold: true };
  return sheet;
}

// The workbook as the bytes the documents bucket stores.
export async function toXlsx<Row>(
  columns: readonly CsvColumn<Row>[],
  rows: readonly Row[],
  watermark: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Edu Wisata Gisikdrono';
  const sheet = addSheet(workbook, columns, watermark);
  for (const row of rows) sheet.addRow(columns.map((column) => xlsxCellValue(column.value(row))));
  sheet.addRow([]);
  sheet.addRow([neutralizeFormula(watermark)]).font = { italic: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
