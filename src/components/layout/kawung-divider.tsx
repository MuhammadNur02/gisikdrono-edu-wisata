import { cn } from '@/lib/utils/cn';

// One row of five kawung flowers, 160 x 32, generated in pen.dev (DESIGN-SPEC §1.8, export/motifs/kawung-row.html)
// and flattened into paths: never hand-drawn. Strokes take the soga accent; the flower centres the paper.
const KAWUNG_ROW_PETALS = [
  'M15.84 17.97c-0.4 8.16-8.67 14.24-15.67 13.29-0.11-0.02-0.13-0.11-0.13-0.2-0.64-7.28 6.23-14.87 13.8-15.09',
  'M16.13 18.04c0.35 8.43 8.98 14.21 15.45 13.31 0.15-0.02 0.2-0.11 0.2-0.24 0.37-7.7-6.62-14.79-13.86-15.16',
  'M15.75 13.59c-0.48-8.36-8.89-14.26-15.53-13.49-0.13 0.02-0.18 0.11-0.18 0.22-0.53 7.55 6.47 14.83 13.8 15.07',
  'M16.1 13.66c0.33-8.54 8.38-14.3 15.49-13.51 0.11 0.02 0.15 0.11 0.15 0.2 0.29 7.72-6.6 14.63-13.84 15.01',
  'M47.53 18.02c-0.33 8.52-9 14.15-15.36 13.27-0.09-0.02-0.13-0.09-0.13-0.18-0.24-7.77 6.6-14.76 13.62-15.2',
  'M48.05 17.99c0.35 8.63 8.91 14.17 15.4 13.31 0.13-0.02 0.18-0.11 0.18-0.22 0.44-7.83-6.65-14.68-13.6-15.18',
  'M47.57 13.57c-0.33-8.43-8.65-14.15-15.31-13.51-0.11 0.02-0.15 0.09-0.15 0.2-0.33 7.81 6.45 14.68 13.55 15.14',
  'M48.1 13.66c0.31-8.54 8.56-14.39 15.36-13.55 0.13 0.02 0.18 0.11 0.18 0.22 0.29 7.68-6.45 14.52-13.47 15.03',
  'M79.67 17.99c-0.33 8.6-9.04 14.08-15.4 13.27-0.11-0.02-0.15-0.09-0.15-0.18-0.33-7.81 6.54-14.72 13.55-15.2',
  'M80.13 17.99c0.31 8.76 9.02 14.08 15.45 13.27 0.13-0.02 0.18-0.09 0.18-0.2 0.29-7.88-6.67-14.72-13.62-15.18',
  'M79.63 13.55c-0.29-8.45-8.71-14.21-15.29-13.49-0.11 0.02-0.15 0.09-0.15 0.2-0.31 7.75 6.4 14.63 13.49 15.09',
  'M80.18 13.66c0.31-8.54 8.56-14.39 15.45-13.55 0.11 0.02 0.15 0.11 0.15 0.22 0.24 7.75-6.54 14.5-13.58 15.03',
  'M111.73 18.02c-0.33 8.69-8.91 14.19-15.31 13.33-0.11-0.02-0.15-0.11-0.15-0.22-0.31-7.86 6.51-14.7 13.58-15.2',
  'M112.22 18.02c0.33 8.76 9.04 14.19 15.42 13.36 0.11-0.02 0.15-0.11 0.15-0.22 0.33-7.83-6.62-14.68-13.62-15.18',
  'M111.8 13.59c-0.33-8.45-8.69-14.21-15.38-13.44-0.11 0.02-0.15 0.11-0.15 0.22-0.24 7.7 6.45 14.59 13.55 15.05',
  'M112.3 13.66c0.35-8.49 8.34-14.26 15.34-13.47 0.11 0.02 0.15 0.11 0.15 0.22 0.18 7.68-6.62 14.48-13.6 14.96',
  'M143.83 18.04c-0.35 8.65-9 14.04-15.34 13.25-0.11-0.02-0.15-0.09-0.15-0.18-0.26-7.88 6.54-14.79 13.53-15.2',
  'M144.3 18.04c0.33 8.69 9.07 14.08 15.51 13.25 0.11-0.02 0.15-0.09 0.15-0.18 0.51-7.72-6.56-14.72-13.69-15.18',
  'M144.03 13.55c-0.29-8.45-8.71-14.21-15.53-13.49-0.11 0.02-0.15 0.09-0.15 0.2-0.31 7.7 6.36 14.65 13.47 15.12',
  'M144.38 13.62c0.42-8.45 8.67-14.39 15.42-13.51 0.11 0.02 0.15 0.11 0.15 0.22 0.62 7.55-6.38 14.5-13.64 15.03',
] as const;
// The five flower centres, as svg attributes.
const KAWUNG_ROW_CENTRES = [
  { cx: '15.79', cy: '15.67' },
  { cx: '47.82', cy: '15.67' },
  { cx: '79.86', cy: '15.67' },
  { cx: '112.04', cy: '15.73' },
  { cx: '144.2', cy: '15.67' },
] as const;
const CENTRE_RADIUS = '2.18';

export function KawungRow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 160 32"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-8 w-40 shrink-0', className)}
    >
      {KAWUNG_ROW_PETALS.map((path) => (
        <path key={path} d={path} />
      ))}
      {KAWUNG_ROW_CENTRES.map(({ cx, cy }) => (
        <circle key={cx} cx={cx} cy={cy} r={CENTRE_RADIUS} className="fill-background" />
      ))}
    </svg>
  );
}

// Divider/Batik Kawung (DESIGN-SPEC §1.8): a hairline, the kawung row, a hairline. At most once per page. As it comes
// into view the hairlines draw outward from the flowers and the flowers settle in (§4, Home: Batik divider).
export function KawungDivider({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('flex items-center gap-6', className)}>
      <span className="h-px flex-1 origin-right reveal-rule bg-border-strong" />
      <KawungRow className="reveal-scale text-rw13 reveal-scale-subtle stagger-2" />
      <span className="h-px flex-1 origin-left reveal-rule bg-border-strong" />
    </div>
  );
}
