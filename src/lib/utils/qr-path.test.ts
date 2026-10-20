import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';

import { qrSvgPath } from '@/lib/utils/qr-path';

const URI =
  'otpauth://totp/Edu%20Wisata%20Gisikdrono:admin-rw05%40dev.gisikdrono.test?secret=JBSWY3DPEHPK3PXP&issuer=Edu%20Wisata%20Gisikdrono';

// Paints the path back onto a grid, one cell per module, to compare with the matrix qrcode encoded.
function paint(path: string, size: number): boolean[][] {
  const grid = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  for (const [, x, y, length] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let column = Number(x); column < Number(x) + Number(length); column += 1) {
      const row = grid[Number(y)];
      if (row) row[column] = true;
    }
  }
  return grid;
}

describe('qrSvgPath', () => {
  it('draws exactly the dark modules of the code, row by row', () => {
    const { size, path } = qrSvgPath(URI);
    const { modules } = QRCode.create(URI, { errorCorrectionLevel: 'M' });

    expect(size).toBe(modules.size);
    const grid = paint(path, size);
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        expect(grid[row]?.[column]).toBe(modules.get(row, column) === 1);
      }
    }
  });

  it('starts with the top row of the finder pattern as one run', () => {
    expect(qrSvgPath(URI).path.startsWith('M0 0h7v1h-7z')).toBe(true);
  });
});
