import type { PDFName } from 'pdf-lib';

// PDF names may hide letters behind #xx escapes. pdf-lib decodes only the upper-case ones, so /#4aavaScript stays
// as written while a reader sees /JavaScript; the booklet scan therefore compares every spelling a reader could
// take a name for (docs/Security.md §8.4, UPL-05). A reader decodes the escapes of a name once, so pdf-lib's spelling
// and one decoding of it in either case are all there is. Decoding again until nothing changes made a name of nested
// escapes cost time and memory by the square of its length (security review of PR #14, F1); the load also refuses
// any name longer than the format allows (./pdf-load-guard.ts).

const HEX_ESCAPE = /#([0-9a-fA-F]{2})/g;
const HEX = 16;

function decodeHexEscapes(name: string): string {
  return name.replace(HEX_ESCAPE, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, HEX)),
  );
}

// The length of a name as written in the file once its escapes are decoded: each #xx is one byte.
export function decodedNameLength(writtenName: string): number {
  return writtenName.replace(HEX_ESCAPE, '#').length;
}

export function nameSpellings(name: PDFName): string[] {
  const asPdfLibReadsIt = name.decodeText();
  const asAReaderReadsIt = decodeHexEscapes(asPdfLibReadsIt);
  return asAReaderReadsIt === asPdfLibReadsIt
    ? [asPdfLibReadsIt]
    : [asPdfLibReadsIt, asAReaderReadsIt];
}
