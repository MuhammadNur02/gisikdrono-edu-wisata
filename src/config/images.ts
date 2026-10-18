// docs/StyleGuide.md §8.2. The widths next/image may ask the Supabase transformer for; 1600 is the largest
// file the upload pipeline keeps, so nothing is ever scaled up.
export const IMAGE_DEVICE_WIDTHS = [320, 480, 640, 960, 1280, 1600];

export const IMAGE_QUALITY = 75;

// `sizes` for each kind of slot (Task P2.3.03): how wide the slot is at each breakpoint, so a wide screen never
// downloads more than the slot can show.
export const IMAGE_SIZES = {
  // Full container width, which stops at 1280 px.
  hero: '(min-width: 1280px) 1280px, 100vw',
  // A card in the grid of §4.2 (docs/StyleGuide.md §5.8).
  card: '(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw',
  // The photo beside text in a two-column block.
  split: '(min-width: 1024px) 640px, 100vw',
  // The main column of a detail page, two of the three columns from lg (the package and product pages).
  main: '(min-width: 1280px) 820px, (min-width: 1024px) 66vw, 100vw',
  // A tile in the masonry gallery, two to four columns (§5.11).
  thumb: '(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw',
} as const;
