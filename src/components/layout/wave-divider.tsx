import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §8.5 (DESIGN-SPEC §2.9). `gentle` is Divider/Wave, the soft step into another tone (into a dark
// band, or the night of the footer), drawn on 1440 x 64 and stretched to the width. `arc` is Divider/Arc under the home
// hero: the paper rises over the photo's two corners and meets its lower edge in the middle. A phone gets the arc's
// own 390 x 40 drawing, so it keeps its curve instead of flattening.
const WAVE_PATH = 'M0 34C240 4 480 4 720 30C960 56 1200 60 1440 26V64H0Z';
const ARC_PATH_WIDE = 'M0 0C360 128 1080 128 1440 0V96H0Z';
const ARC_PATH_PHONE = 'M0 0C97.5 53.3 292.5 53.3 390 0V40H0Z';

// Opaque surfaces only: a wave in a translucent tone would show a seam where it meets its section.
const WAVE_TONES = {
  background: 'text-background',
  muted: 'text-muted',
  night: 'text-night',
  forest: 'text-forest-night',
} as const;

export type WaveVariant = 'gentle' | 'arc';
export type WaveTone = keyof typeof WAVE_TONES;

export interface WaveDividerProps {
  // The colour of the section the wave belongs to, which it paints over the bottom of the section above.
  tone: WaveTone;
  variant?: WaveVariant;
  // Mirrors the wave, so two waves in a row do not repeat the same crest.
  flip?: boolean;
}

// The svg's own box: it sits on top of its `relative` section and reaches up over the one before; the 1 px overlap
// hides the sub-pixel seam.
const SHAPE_CLASS =
  'pointer-events-none absolute inset-x-0 bottom-full block w-full translate-y-px';

function Shape({ viewBox, path, className }: { viewBox: string; path: string; className: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={viewBox}
      preserveAspectRatio="none"
      className={cn(SHAPE_CLASS, className)}
    >
      <path d={path} className="fill-current" />
    </svg>
  );
}

// Server-rendered and purely decorative: no script, hidden from assistive technology.
export function WaveDivider({ tone, variant = 'gentle', flip = false }: WaveDividerProps) {
  const colour = cn(WAVE_TONES[tone], flip && '-scale-x-100');
  if (variant === 'arc') {
    return (
      <>
        <Shape
          viewBox="0 0 390 40"
          path={ARC_PATH_PHONE}
          className={cn('h-10 md:hidden', colour)}
        />
        <Shape
          viewBox="0 0 1440 96"
          path={ARC_PATH_WIDE}
          className={cn('h-16 max-md:hidden lg:h-24', colour)}
        />
      </>
    );
  }
  return (
    <Shape viewBox="0 0 1440 64" path={WAVE_PATH} className={cn('h-6 md:h-10 lg:h-14', colour)} />
  );
}
