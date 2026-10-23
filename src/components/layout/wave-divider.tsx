import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §8.5 (decision of 2026-10-23): the wave between two home sections of different tones, after
// the shape dusunbambu.id draws under its hero. The path is drawn on a 1440 x 64 box and stretched to the width, so
// at 360 px it flattens to 360 x 24 and stays smooth; `bambu` is the asymmetric one under the hero.
const WAVE_PATHS = {
  gentle: 'M0 32C240 0 480 0 720 24S1200 64 1440 28V64H0Z',
  bambu: 'M0 48C360 64 620 8 980 20C1200 28 1340 44 1440 36V64H0Z',
} as const;

// Opaque surfaces only: a wave in a translucent tone (bg-muted/40) would show a seam where it meets its section.
const WAVE_TONES = {
  background: 'text-background',
  warm: 'text-surface-warm',
} as const;

export type WaveVariant = keyof typeof WAVE_PATHS;
export type WaveTone = keyof typeof WAVE_TONES;

export interface WaveDividerProps {
  // The colour of the section the wave belongs to, which it paints over the bottom of the section above.
  tone: WaveTone;
  variant?: WaveVariant;
  // Mirrors the wave, so two waves in a row do not repeat the same crest.
  flip?: boolean;
}

// Server-rendered and purely decorative: no script, hidden from assistive technology. It sits on top of its
// `relative` section and reaches up over the one before; the 1 px overlap hides the sub-pixel seam.
export function WaveDivider({ tone, variant = 'gentle', flip = false }: WaveDividerProps) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 1440 64"
      preserveAspectRatio="none"
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-full block h-6 w-full translate-y-px md:h-10 lg:h-16',
        WAVE_TONES[tone],
        flip && '-scale-x-100',
      )}
    >
      <path d={WAVE_PATHS[variant]} className="fill-current" />
    </svg>
  );
}
