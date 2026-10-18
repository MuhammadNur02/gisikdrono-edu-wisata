import { cn } from '@/lib/utils/cn';

const PARAGRAPH_BREAK = /\n\s*\n/;

export interface TextBlockProps {
  // A `*_md` column such as rw_units.description_md.
  text: string;
  className?: string;
}

// The CMS stores RW profiles as Markdown. Until a Markdown renderer is chosen, the text is shown as plain
// paragraphs: React escapes it, so nothing in it can become markup (CLAUDE.md §7.8), and a stray `**` shows
// as written rather than breaking the page.
export function TextBlock({ text, className }: TextBlockProps) {
  const paragraphs = text
    .split(PARAGRAPH_BREAK)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return (
    <div className={cn('space-y-4 text-body-lg text-pretty', className)}>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}
