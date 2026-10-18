// A public-media image ready for next/image: its path inside the bucket, the alt text, and, when the upload
// pipeline recorded them, its pixel size and the average colour the slot shows while it loads
// (docs/StyleGuide.md §8.2).
export interface PublicImage {
  path: string;
  alt: string;
  width: number | null;
  height: number | null;
  placeholderColour: string | null;
}
