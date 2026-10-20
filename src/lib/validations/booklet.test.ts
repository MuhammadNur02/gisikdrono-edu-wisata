import { describe, expect, it } from 'vitest';

import { saveBookletSchema } from './booklet';

const BOOKLET_ID = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const BOOKLET = {
  id: BOOKLET_ID,
  pdfPath: `rw-05/booklets/${BOOKLET_ID}/booklet.pdf`,
  kind: 'ebooklet',
  slug: 'ecowastreme-2026',
  title: 'Mengenal Ecowastreme RW 05',
  description: '',
  status: 'published',
};

describe('saveBookletSchema', () => {
  it('takes a booklet and parses its own output again', () => {
    const once = saveBookletSchema.parse(BOOKLET);
    expect(once.description).toBeNull();
    expect(saveBookletSchema.parse(once)).toEqual(once);
  });

  it('asks for the PDF while none has been uploaded', () => {
    const result = saveBookletSchema.safeParse({ ...BOOKLET, pdfPath: '' });
    expect(result.error?.issues[0]).toMatchObject({
      path: ['pdfPath'],
      message: 'Unggah PDF booklet dulu, lalu simpan.',
    });
  });

  // The owner, the page count, the size and the page folder are the server's to decide, never the form's.
  it.each([
    ['rwId', 8],
    ['pageCount', 100],
    ['fileSizeBytes', 1],
    ['pageImagesPrefix', 'rw-08/booklets/x/pages'],
    ['downloadCount', 1000],
    ['createdBy', BOOKLET_ID],
  ])('refuses a form that names %s', (field, value) => {
    expect(saveBookletSchema.safeParse({ ...BOOKLET, [field]: value }).success).toBe(false);
  });

  it.each([
    ['a slug with capitals', { slug: 'Ecowastreme' }],
    ['a slug with a slash', { slug: 'rw-05/booklet' }],
    ['an empty title', { title: '   ' }],
    ['a title past 160 characters', { title: 'a'.repeat(161) }],
    ['a description past 1000 characters', { description: 'a'.repeat(1001) }],
    ['an archived status', { status: 'archived' }],
    ['an unknown kind', { kind: 'brochure' }],
    ['an id that is not a uuid', { id: '42' }],
  ])('refuses %s', (_case, change) => {
    expect(saveBookletSchema.safeParse({ ...BOOKLET, ...change }).success).toBe(false);
  });
});
