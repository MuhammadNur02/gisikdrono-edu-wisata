// docs/StyleGuide.md §8.4: Open Graph images are 1200 × 630, the title in Plus Jakarta Sans 700 at 64 px on two
// lines at most.
export const OG_SIZE = { width: 1200, height: 630 } as const;

export const OG_CONTENT_TYPE = 'image/png';

export const OG_LAYOUT = {
  padding: 72,
  accentBarWidth: 16,
  gap: 28,
  eyebrowSize: 28,
  titleSize: 64,
  titleLineHeight: 1.1,
  titleLines: 2,
  detailSize: 32,
  footerSize: 26,
} as const;

// The TTF files the images draw with (public/fonts, SIL Open Font License beside them).
export const OG_FONT_FILES = {
  display: 'public/fonts/PlusJakartaSans-Bold.ttf',
  body: 'public/fonts/Inter-Regular.ttf',
} as const;

export const OG_FONT_WEIGHTS = { display: 700, body: 400 } as const;
