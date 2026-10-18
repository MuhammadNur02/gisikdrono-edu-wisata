import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { copy } from '@/lib/copy/id';
import type { FinalizedPdf } from '@/types/upload';

import { BookletUploader } from './booklet-uploader';

const BOOKLET: FinalizedPdf = {
  kind: 'pdf',
  path: 'rw-05/booklets/6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab/booklet.pdf',
  pageCount: 24,
  fileSizeBytes: 3_000_000,
};

function render(value: FinalizedPdf | null) {
  return renderToStaticMarkup(
    createElement(BookletUploader, {
      value,
      onChange: () => undefined,
      upload: () => Promise.resolve(BOOKLET),
      id: 'booklet',
    }),
  );
}

describe('BookletUploader', () => {
  it('asks for a PDF and reminds the officer about GPS in the photos, tied to the picker', () => {
    const html = render(null);

    expect(html).toContain('accept="application/pdf"');
    expect(html).toContain(copy.forms.booklet.hint);
    expect(html).toContain(
      'Pastikan foto di booklet tidak memuat lokasi (GPS). Ekspor PDF dari Canva/Word biasanya sudah aman.',
    );
    expect(html).toContain('aria-describedby="booklet-gps"');
    expect(html).toContain('id="booklet-gps"');
  });

  it('says what was published once the booklet is up, and offers no second upload', () => {
    const html = render(BOOKLET);

    expect(html).toContain(copy.forms.booklet.done(24));
    expect(html).not.toContain('type="file"');
  });
});
