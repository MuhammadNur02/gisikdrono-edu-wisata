// docs/StyleGuide.md §8.2. The widths next/image may ask the Supabase transformer for; 1600 is the largest
// file the upload pipeline keeps, so nothing is ever scaled up.
export const IMAGE_DEVICE_WIDTHS = [320, 480, 640, 960, 1280, 1600];

export const IMAGE_QUALITY = 75;

// `sizes` for each kind of slot (Task P2.3.03): the hero tops out at 1280 px and a card at 640 px, so a
// wide screen never downloads more than the slot can show. Gallery thumbnails (480 px) arrive with P2.6.
export const IMAGE_SIZES = {
  hero: '(min-width: 1280px) 1280px, 100vw',
  card: '(min-width: 1024px) 640px, (min-width: 640px) 50vw, 100vw',
} as const;
