import type { PDFName } from 'pdf-lib';

// PDF names may hide letters behind #xx escapes. pdf-lib decodes only the upper-case ones, so /#4aavaScript stays
// as written while a reader sees /JavaScript; the booklet scan therefore compares every spelling a reader could
// take a name for (docs/Security.md §8.4, UPL-05).

const HEX_ESCAPE = /#([0-9a-fA-F]{2})/g;
const HEX = 16;

function decodeHexEscapes(name: string): string {
  return name.replace(HEX_ESCAPE, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, HEX)),
  );
}

// Each pass that changes the name makes it shorter, so the loop ends.
export function nameSpellings(name: PDFName): string[] {
  const spellings = [name.decodeText()];
  for (;;) {
    const last = spellings.at(-1) ?? '';
    const next = decodeHexEscapes(last);
    if (next === last) return spellings;
    spellings.push(next);
  }
}
