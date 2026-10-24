// The light-mode tokens of src/styles/globals.css as hex, for the two places that cannot read a CSS variable:
// the Open Graph images (docs/StyleGuide.md §8.4) and the web manifest. src/styles/globals.test.ts fails the
// moment a value here drifts from its token.
export const BRAND_HEX = {
  // --brand-deep, the night band
  deep: '#15120E',
  // --brand-ice, the sunken paper
  ice: '#EDE3D1',
  // --background, the warm paper
  background: '#F6EFE3',
} as const;
