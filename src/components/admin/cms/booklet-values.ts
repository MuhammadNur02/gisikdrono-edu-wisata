import type { SaveBookletInput } from '@/lib/validations/booklet';
import type { BookletAdmin } from '@/types/cms';

// A new booklet. Its id is replaced by the one each upload attempt goes under (booklet-form.tsx).
export function blankBooklet(): SaveBookletInput {
  return {
    id: crypto.randomUUID(),
    pdfPath: '',
    kind: 'ebooklet',
    slug: '',
    title: '',
    description: '',
    status: 'published',
  };
}

// Exactly the form's fields: the owner, the page count and the size stay out, since the schema refuses anything it
// does not list.
export function bookletValues(booklet: BookletAdmin): SaveBookletInput {
  return {
    id: booklet.id,
    pdfPath: booklet.pdfPath,
    kind: booklet.kind,
    slug: booklet.slug,
    title: booklet.title,
    description: booklet.description ?? '',
    status: booklet.status === 'published' ? 'published' : 'draft',
  };
}
