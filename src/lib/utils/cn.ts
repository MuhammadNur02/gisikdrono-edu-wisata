import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The eleven type-scale steps defined with @utility in src/styles/globals.css (docs/StyleGuide.md §3.2).
export const TYPE_SCALE_STEPS = [
  'display-xl',
  'display-lg',
  'h1',
  'h2',
  'h3',
  'h4',
  'body-lg',
  'body',
  'body-sm',
  'caption',
  'overline',
] as const;

// tailwind-merge does not know our steps, so it would read text-h1 as a colour and silently drop it next
// to text-muted-foreground. Registering them as font sizes keeps both, and lets text-h2 override text-h1.
const mergeClasses = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: [...TYPE_SCALE_STEPS] }] } },
});

export function cn(...inputs: ClassValue[]): string {
  return mergeClasses(clsx(inputs));
}
