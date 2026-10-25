import 'server-only';

import { PDFDocument } from 'pdf-lib';

// Every document this site prints is in Indonesian (CLAUDE.md §4 rule 14).
const PDF_LANGUAGE = 'id';

// docs/PRD.md FR-POST-02, docs/Security.md §10.4: the participants' certificates are rendered once as one multi-page
// document, and each page becomes a file of its own, so every participant's certificate is kept and handed out alone.
// `titles` names each page's own file (its certificate number), so no file is titled after another person's.
export async function splitPdfPages(pdf: Buffer, titles: readonly string[]): Promise<Buffer[]> {
  const source = await PDFDocument.load(pdf);
  const pages: Buffer[] = [];
  for (const index of source.getPageIndices()) {
    const single = await PDFDocument.create();
    single.setTitle(titles[index] ?? '');
    single.setLanguage(PDF_LANGUAGE);
    const [page] = await single.copyPages(source, [index]);
    if (page) single.addPage(page);
    pages.push(Buffer.from(await single.save()));
  }
  return pages;
}
