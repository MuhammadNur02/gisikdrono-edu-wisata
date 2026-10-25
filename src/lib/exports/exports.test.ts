import { Readable } from 'node:stream';

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { cellOf, exportColumns, exportRowsOf } from '@/lib/exports/columns';
import { exportDownloadName, exportFileName, exportStoragePath } from '@/lib/exports/file';
import { toXlsx, xlsxCellValue } from '@/lib/exports/xlsx';
import { toCsv, UTF8_BOM } from '@/lib/utils/csv';

const WATERMARK = 'Diekspor oleh Siti 25-10-2026 09:30 WIB - Dokumen rahasia Kelurahan Gisikdrono';

const ATTENDANCE_ROW = {
  session_date: '2026-10-27',
  start_time: '08:30:00',
  session_label: 'Sesi Pagi',
  rw_id: 5,
  booking_code: 'GSK-7F3K9Q2M',
  institution_name: '=HYPERLINK("https://evil.test","klik")',
  booked_pax: 30,
  checked_in_pax: 28,
  unpaid_pax: 0,
  ticket_status: 'used',
  manual_checkin: true,
};

describe('export columns', () => {
  it('names every column of each kind and writes the RW, flags and objects as a reader expects', () => {
    expect(exportColumns('attendance').map((column) => column.header)).toEqual([
      'Tanggal kunjungan',
      'Jam mulai',
      'Sesi',
      'RW',
      'Kode reservasi',
      'Instansi',
      'Terdaftar',
      'Hadir',
      'Hadir belum dibayar',
      'Status tiket',
      'Check-in manual',
    ]);
    const cells = exportColumns('attendance').map((column) => column.value(ATTENDANCE_ROW));
    expect(cells).toContain('RW 05');
    expect(cells.at(-1)).toBe('Ya');
    expect(cells).toContain(30);
  });

  it('never writes a contact column into visits or attendance', () => {
    for (const kind of ['visits', 'attendance'] as const) {
      const headers = exportColumns(kind).map((column) => column.header.toLowerCase());
      expect(headers.some((header) => /telepon|whatsapp|email|phone/.test(header))).toBe(false);
    }
  });

  it('keeps numbers as numbers and writes a missing field as empty', () => {
    expect(cellOf(-50000)).toBe(-50000);
    expect(cellOf(undefined)).toBeNull();
    expect(cellOf(null, 'rw')).toBeNull();
    expect(cellOf(false, 'flag')).toBe('Tidak');
    expect(cellOf({ status: 'paid' }, 'json')).toBe('{"status":"paid"}');
    expect(cellOf({ a: 1 })).toBe('{"a":1}');
  });

  it('reads only the objects of the answer', () => {
    expect(exportRowsOf([ATTENDANCE_ROW, 'x', null, [1]])).toEqual([ATTENDANCE_ROW]);
    expect(exportRowsOf(undefined)).toEqual([]);
  });
});

describe('the CSV of an export', () => {
  it('starts with the BOM, neutralises a formula and ends with the watermark', () => {
    const csv = toCsv(exportColumns('attendance'), [ATTENDANCE_ROW], WATERMARK);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""https://evil.test"",""klik"")"`);
    expect(csv.trimEnd().endsWith(WATERMARK)).toBe(true);
  });
});

describe('the XLSX of an export', () => {
  it('turns a formula-looking string inert and leaves numbers and empty cells alone', () => {
    expect(xlsxCellValue('=1+1')).toBe("'=1+1");
    expect(xlsxCellValue('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(xlsxCellValue('RW 05')).toBe('RW 05');
    expect(xlsxCellValue(-50000)).toBe(-50000);
    expect(xlsxCellValue(null)).toBeNull();
  });

  it('writes the header, the rows with every string cell neutralised, and the watermark row and footer', async () => {
    const buffer = await toXlsx(exportColumns('attendance'), [ATTENDANCE_ROW], `${WATERMARK} & co`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.read(Readable.from([buffer]));
    const sheet = workbook.getWorksheet('Ekspor');
    expect(sheet?.getRow(1).getCell(1).value).toBe('Tanggal kunjungan');
    const data = sheet?.getRow(2);
    expect(data?.getCell(6).value).toBe(`'${ATTENDANCE_ROW.institution_name}`);
    expect(data?.getCell(7).value).toBe(30);
    expect(sheet?.getRow(4).getCell(1).value).toBe(`${WATERMARK} & co`);
    expect(sheet?.headerFooter.oddFooter).toBe(`&L${WATERMARK} && co`);
  });
});

describe('export files', () => {
  it('names the file by Semarang time and kind, in the requester’s folder', () => {
    const at = new Date('2026-10-25T02:30:05Z');
    const name = exportFileName('attendance', 'xlsx', at);
    expect(name).toBe('20261025-093005-attendance.xlsx');
    expect(exportStoragePath('00000000-0000-4000-8000-000000000005', name)).toBe(
      'exports/00000000-0000-4000-8000-000000000005/20261025-093005-attendance.xlsx',
    );
    expect(exportDownloadName(`exports/x/${name}`)).toBe('ekspor-20261025-093005-attendance.xlsx');
  });
});
