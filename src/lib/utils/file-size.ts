// "2,4 MB" next to a download, so a visitor on mobile data knows what the PDF will cost. Booklets are at
// most 50 MB, so kB and MB are the only units needed.
const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;

const oneDecimal = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const wholeNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

export function formatFileSize(bytes: number): string {
  if (bytes >= BYTES_PER_MB) return `${oneDecimal.format(bytes / BYTES_PER_MB)} MB`;
  return `${wholeNumber.format(Math.max(1, bytes / BYTES_PER_KB))} kB`;
}
