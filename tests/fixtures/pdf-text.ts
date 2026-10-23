import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// The text of every page of a rendered PDF, in reading order, for the document tests: what a visitor would read, not
// what the React tree said.
export async function pdfText(pdf: Buffer): Promise<{ pageCount: number; text: string }> {
  const loading = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
  const document = await loading.promise;
  const pages: string[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replaceAll(/\s+/g, ' '),
    );
  }
  const pageCount = document.numPages;
  await loading.destroy();
  return { pageCount, text: pages.join('\n') };
}
