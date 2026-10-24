import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The type-scale steps defined with @utility in src/styles/globals.css (docs/StyleGuide.md §3.2).
export const TYPE_SCALE_STEPS = [
  'hero-statement',
  'hero-lead',
  'display-rw',
  'display',
  'display-lg',
  'intro',
  'section-title',
  'section-title-compact',
  'h1',
  'h2',
  'h3',
  'h4',
  'card-title',
  'figure',
  'price',
  'eyebrow',
  'meta-caps',
  'body-lg',
  'body',
  'body-md',
  'quote',
  'article',
  'body-sm',
  'label-sm',
  'label',
  'label-lg',
  'label-xl',
  'caption',
  'overline',
  'wordmark-eyebrow',
  'wordmark',
] as const;

// tailwind-merge does not know our steps, so it would read text-h1 as a colour and silently drop it next
// to text-muted-foreground. Registering them as font sizes keeps both, and lets text-h2 override text-h1.
// border-control (1.5 px) is a border width in the same way, so it survives next to a border colour, and w-drawer a
// width that replaces the sheet's own.
const mergeClasses = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...TYPE_SCALE_STEPS] }],
      'border-w': ['border-control'],
      w: ['w-drawer'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return mergeClasses(clsx(inputs));
}
