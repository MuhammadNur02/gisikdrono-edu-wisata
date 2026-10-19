import { describe, expect, it, vi } from 'vitest';

import type * as PdfAnnotations from './pdf-annotations';
import { scanBookletPdf } from './pdf-scan';
import { readableCopy } from '../../../tests/fixtures/pdf';
import { PRIVATE_DATA_CASES } from '../../../tests/fixtures/pdf-private-data';

// The control for pdf-metadata.test.ts (security review of PR #14, N2): with the cleanup switched off, every needle
// those tests expect to be gone is found in the copy by the same reading. So an assertion there cannot pass merely
// because the copy hides what it holds, as a search of its compressed bytes did.

vi.mock('./pdf-annotations', async (importOriginal) => ({
  ...(await importOriginal<typeof PdfAnnotations>()),
  removeComments: () => 0,
}));
vi.mock('./pdf-metadata', () => ({ removeDocumentMetadata: () => undefined }));

describe('scanBookletPdf with the cleanup switched off', () => {
  it.each(PRIVATE_DATA_CASES.map((privateCase) => [privateCase.name, privateCase] as const))(
    'still shows %s in the copy',
    async (_name, privateCase) => {
      const result = await scanBookletPdf(privateCase.pdf());
      if (!result.ok) throw new Error(`the scan refused the fixture: ${result.problem}`);
      const copy = await readableCopy(result.pdf);

      for (const needle of privateCase.needles) expect(copy).toContain(needle);
    },
  );
});
