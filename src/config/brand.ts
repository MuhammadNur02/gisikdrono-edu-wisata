// The light-mode tokens of src/styles/globals.css as hex, for the two places that cannot read a CSS variable:
// the Open Graph images (docs/StyleGuide.md §8.4) and the web manifest. src/styles/globals.test.ts fails the
// moment a value here drifts from its token.
export const BRAND_HEX = {
  // --brand-deep
  deep: '#0F172A',
  // --brand-ice
  ice: '#EFF6FF',
  // --background
  background: '#FFFFFF',
} as const;
