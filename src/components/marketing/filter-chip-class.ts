import { cn } from '@/lib/utils/cn';

// Chip/Filter of DESIGN-SPEC §2.3: 40 px (44 on phones), the surface with a line-strong edge, 14/500. Pointed at: the
// sunken paper and an ink-3 edge; pressed .97. Chosen: the inverse fill with a check that springs in, so the choice
// never rests on colour alone (§1.1 P4). It never shrinks, so a row of chips can scroll sideways on a phone. Shared by
// the link chips of filter-chips.tsx and the toggle chips of catalogue-chips.tsx.
export function chipClassName(isPressed: boolean): string {
  return cn(
    'inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-body-sm font-medium whitespace-nowrap transition-colors duration-150 ease-out-soft press-scale md:h-10',
    isPressed
      ? 'border-secondary bg-secondary text-secondary-foreground'
      : 'border-border-strong bg-card text-foreground hover:border-muted-foreground hover:bg-muted',
  );
}
