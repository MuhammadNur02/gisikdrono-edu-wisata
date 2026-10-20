import 'server-only';

import QRCode from 'qrcode';

// The TOTP enrolment QR code as one SVG path, one square per dark module with each row's runs merged. Supabase's own
// qr_code is a data: URL, which the CSP's img-src does not allow, and SVG markup could only be inserted as raw HTML,
// which the project bans; a path renders as an ordinary <svg> element instead (CLAUDE.md §7.8).
export function qrSvgPath(text: string): { size: number; path: string } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const commands: string[] = [];
  for (let row = 0; row < modules.size; row += 1) {
    let runStart: number | null = null;
    for (let column = 0; column <= modules.size; column += 1) {
      const isDark = column < modules.size && modules.get(row, column) === 1;
      if (isDark && runStart === null) runStart = column;
      if (!isDark && runStart !== null) {
        const length = column - runStart;
        commands.push(
          `M${String(runStart)} ${String(row)}h${String(length)}v1h-${String(length)}z`,
        );
        runStart = null;
      }
    }
  }
  return { size: modules.size, path: commands.join('') };
}
