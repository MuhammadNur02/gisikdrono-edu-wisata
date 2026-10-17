import { cn } from '@/lib/utils/cn';

export interface SiteWordmarkProps {
  className?: string;
}

// docs/StyleGuide.md §11 D1: a text wordmark in Plus Jakarta Sans 800 until the kelurahan supplies a logo.
// Stacked, it fits next to the booking button and the menu at 360 px.
export function SiteWordmark({ className }: SiteWordmarkProps) {
  return (
    <span className={cn('flex flex-col', className)}>
      <span className="text-overline text-primary-text">Edu Wisata</span>
      <span className="text-h4 leading-tight font-extrabold tracking-tight">Gisikdrono</span>
    </span>
  );
}
