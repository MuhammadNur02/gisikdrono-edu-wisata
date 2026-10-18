import { BOOKLET_PDF_TYPE, MAX_BOOKLET_PDF_BYTES } from '@/config/uploads';

export type BookletFileProblem = 'type' | 'size';

// The quick browser-side answer before a booklet goes up (docs/StyleGuide.md §5.6); api/uploads/sign checks the
// declared type and first bytes again and finalize the whole file, so this is a convenience, not the control.
export function checkBookletFile(file: { type: string; size: number }): BookletFileProblem | null {
  if (file.type !== BOOKLET_PDF_TYPE) return 'type';
  return file.size > MAX_BOOKLET_PDF_BYTES ? 'size' : null;
}
