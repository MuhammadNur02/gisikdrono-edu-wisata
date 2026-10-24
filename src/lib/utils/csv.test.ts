import { describe, expect, it } from 'vitest';

import { copy } from '@/lib/copy/id';

import { escapeCsvCell, neutralizeFormula, toCsv, UTF8_BOM, type CsvColumn } from './csv';

describe('neutralizeFormula', () => {
  it.each(['=SUM(A1:A9)', '+62812', '-2+3', '@cmd', '\t=1', '\r=1'])(
    'makes %j inert with a leading apostrophe',
    (text) => {
      expect(neutralizeFormula(text)).toBe(`'${text}`);
    },
  );

  it('leaves ordinary text alone, a formula sign later in the text included', () => {
    expect(neutralizeFormula('SD Negeri 1 = juara')).toBe('SD Negeri 1 = juara');
    expect(neutralizeFormula('')).toBe('');
  });
});

describe('escapeCsvCell', () => {
  it('writes null as an empty cell and numbers and booleans as they are', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(-50_000)).toBe('-50000');
    expect(escapeCsvCell(true)).toBe('true');
  });

  it('quotes a separator, a quote or a line break, doubling quotes', () => {
    expect(escapeCsvCell('Semarang, Jawa Tengah')).toBe('"Semarang, Jawa Tengah"');
    expect(escapeCsvCell('Sanggar "Ngesti"')).toBe('"Sanggar ""Ngesti"""');
    expect(escapeCsvCell('baris\nkedua')).toBe('"baris\nkedua"');
  });

  it('neutralises a formula before quoting it', () => {
    expect(escapeCsvCell('=HYPERLINK("http://evil.test","klik")')).toBe(
      '"\'=HYPERLINK(""http://evil.test"",""klik"")"',
    );
  });
});

describe('toCsv', () => {
  interface Row {
    code: string;
    pax: number;
  }
  const columns: CsvColumn<Row>[] = [
    { header: 'Kode', value: (row) => row.code },
    { header: 'Pax', value: (row) => row.pax },
  ];

  it('starts with the BOM, ends every line with CRLF and closes with the watermark', () => {
    const watermark = copy.dashboard.exports.watermark('Siti', '24 Okt 2026, 09.30 WIB');
    const csv = toCsv(columns, [{ code: 'GSK-7F3K9Q2M', pax: 40 }], watermark);
    // U+FEFF, written as an escape in the source.
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(UTF8_BOM).toHaveLength(1);
    expect(csv.slice(UTF8_BOM.length).split('\r\n')).toEqual([
      'Kode,Pax',
      'GSK-7F3K9Q2M,40',
      '',
      // The time's comma quotes the watermark.
      '"Diekspor oleh Siti 24 Okt 2026, 09.30 WIB - Dokumen rahasia Kelurahan Gisikdrono"',
      '',
    ]);
  });

  it('keeps the watermark of an empty export; a formula sign inside it stays plain text', () => {
    const watermark = copy.dashboard.exports.watermark('=cmd', '24 Okt 2026, 09.30 WIB');
    const lines = toCsv(columns, [], watermark).split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[2]).toBe(
      '"Diekspor oleh =cmd 24 Okt 2026, 09.30 WIB - Dokumen rahasia Kelurahan Gisikdrono"',
    );
  });
});
