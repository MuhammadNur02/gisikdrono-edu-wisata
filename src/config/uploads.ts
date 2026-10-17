// docs/StyleGuide.md §5.6 and docs/Security.md §8.4. The browser checks these for a quick answer;
// api/uploads/sign and the bucket enforce them again, so they are a convenience, not the control.
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_EDGE_PX = 1600;

// galleries.alt_text CHECK (length between 3 and 200).
export const ALT_TEXT_MAX_LENGTH = 200;
