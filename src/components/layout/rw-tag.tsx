import { Badge, type BadgeProps } from '@/components/ui/badge';
import { rwAccentClasses } from '@/config/rw';
import { cn } from '@/lib/utils/cn';
import type { RwBadge } from '@/types/rw-unit';

// Where the badge stands: the RW tint on paper, the surface on a product photo, the dark glass on any other photo.
export type RwTagTone = 'tint' | 'surface' | 'onPhoto';

const TONE_VARIANT = {
  tint: 'rw',
  surface: 'rwSurface',
  onPhoto: 'onPhoto',
} as const satisfies Record<RwTagTone, BadgeProps['variant']>;

export interface RwTagProps {
  rw: RwBadge;
  // Follows the number after a middle dot: the programme (`RW 05 · Ecowastreme`) or a fact (`6 titik aktivitas`).
  detail?: string;
  tone?: RwTagTone;
  size?: BadgeProps['size'];
  className?: string;
}

// Badge/RW of DESIGN-SPEC §2.3: the RW's tint, a dot and the text in its accent. The RW number is always written,
// so the RW never rests on colour alone (§6).
export function RwTag({ rw, detail, tone = 'tint', size, className }: RwTagProps) {
  return (
    <Badge
      variant={TONE_VARIANT[tone]}
      size={size}
      dot
      className={cn(rwAccentClasses(rw.accentKey).scope, className)}
    >
      {detail ? `${rw.label} · ${detail}` : rw.label}
    </Badge>
  );
}

export interface RwComboTagProps {
  rws: readonly RwBadge[];
  tone?: Exclude<RwTagTone, 'onPhoto'>;
  className?: string;
}

// A combination package wears the primary set and names every RW it visits: `RW 05 + RW 13`.
export function RwComboTag({ rws, tone = 'tint', className }: RwComboTagProps) {
  return (
    <Badge variant={TONE_VARIANT[tone]} dot className={cn('rw-scope-combo', className)}>
      {rws.map((rw) => rw.label).join(' + ')}
    </Badge>
  );
}
