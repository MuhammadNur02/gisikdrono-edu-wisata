// Mirrors the slug CHECK on every content table and the public URL rule in CLAUDE.md §3.3.
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// 'Paket Jelajah Ecowastreme & Kampung Seni!' -> 'paket-jelajah-ecowastreme-kampung-seni'.
// Accents are folded ('Café' -> 'cafe') and anything else becomes a single dash.
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}
