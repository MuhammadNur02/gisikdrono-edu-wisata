import { ImageOff } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

export interface PhotoPendingProps {
  // What the photo will show, so the box still says where or what (docs/StyleGuide.md §1.3 G8).
  subject: string;
  className?: string;
}

// docs/StyleGuide.md §1.3 G1: until a real Gisikdrono photo exists, the slot says so instead of
// showing a stock or generated picture.
export function PhotoPending({ subject, className }: PhotoPendingProps) {
  return (
    <figure
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted p-6 text-center',
        className,
      )}
    >
      <ImageOff aria-hidden className="size-6 text-muted-foreground" />
      <figcaption className="space-y-1">
        <span className="block text-body-sm font-medium text-foreground">Foto menyusul</span>
        <span className="block text-caption text-muted-foreground">{subject}</span>
      </figcaption>
    </figure>
  );
}
