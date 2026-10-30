'use client';

import type { ReactNode } from 'react';

import { PhotoFrame } from '@/components/marketing/photo';
import { IMAGE_SIZES } from '@/config/images';
import { useVariantChoice } from '@/hooks/use-variant-choice';
import { productDetailCopy as text } from '@/lib/copy/catalogue';

export interface VariantPhotoProps {
  productName: string;
  // The product's own photo (or its placeholder), rendered on the server: shown until a variant with a photo is
  // picked, and again for a variant without one.
  fallback: ReactNode;
}

// The main photo of a product with variants: the chosen variant's photo takes its place, in the same frame, and a
// polite live region says which one shows, since the swap is silent otherwise (docs/StyleGuide.md §9.1 A7).
export function VariantPhoto({ productName, fallback }: VariantPhotoProps) {
  const { chosen } = useVariantChoice();
  const image = chosen?.image ?? null;
  return (
    <div>
      {image ? (
        <PhotoFrame
          key={image.path}
          image={image}
          sizes={IMAGE_SIZES.main}
          aspectClassName="aspect-square rounded-2xl md:aspect-4/3"
        />
      ) : (
        fallback
      )}
      <p aria-live="polite" className="sr-only">
        {image && chosen ? text.variantPhoto(productName, chosen.label) : ''}
      </p>
    </div>
  );
}
